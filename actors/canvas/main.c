#include "wesenho.h"

#define DEFAULT_WIDTH  800
#define DEFAULT_HEIGHT 1000

typedef struct {
    uint32_t *pixels;
    uint8_t  visible;
    uint8_t  opacity;
} layer_t;

typedef struct {
    char     name[24];
    uint32_t width;
    uint32_t height;
    layer_t  *layers;
    int      layer_count;
    int      layer_capacity;
    int      active_layer;
    uint32_t *out_pixels;
} canvas_doc_t;

static wframebuffer_t *fb = 0;
static canvas_doc_t   canvases[MAX_CANVASES_LIMIT];
static int            canvas_count = 0;
static int            active_canvas = 0;
static uint32_t       current_color = 0xFF000000;

// Simple bump allocator for dynamic wasm memory
static uint8_t *heap_top = 0;

static void *canvas_alloc(uint32_t size) {
    if (!heap_top) {
        extern uint8_t __heap_base;
        heap_top = &__heap_base;
    }
    uintptr_t cur = ((uintptr_t)heap_top + 15) & ~15;
    heap_top = (uint8_t*)(cur + size);

    uint32_t cur_mem_bytes = __builtin_wasm_memory_size(0) * 65536;
    if ((uintptr_t)heap_top > cur_mem_bytes) {
        uint32_t need_pages = (((uintptr_t)heap_top - cur_mem_bytes) + 65535) / 65536;
        __builtin_wasm_memory_grow(0, need_pages);
    }
    return (void*)cur;
}

static inline uint32_t blend_pixel(uint32_t dst, uint32_t src, uint8_t alpha_mod) {
    uint32_t sa = ((src >> 24) & 0xFF) * alpha_mod / 255;
    if (sa == 0) return dst;
    if (sa == 255 && ((dst >> 24) & 0xFF) == 0) return (src & 0x00FFFFFF) | 0xFF000000;

    uint32_t sr = src & 0xFF;
    uint32_t sg = (src >> 8) & 0xFF;
    uint32_t sb = (src >> 16) & 0xFF;

    uint32_t dr = dst & 0xFF;
    uint32_t dg = (dst >> 8) & 0xFF;
    uint32_t db = (dst >> 16) & 0xFF;
    uint32_t da = (dst >> 24) & 0xFF;

    uint32_t inv_sa = 255 - sa;
    uint32_t out_r = (sr * sa + dr * inv_sa) / 255;
    uint32_t out_g = (sg * sa + dg * inv_sa) / 255;
    uint32_t out_b = (sb * sa + db * inv_sa) / 255;
    uint32_t out_a = sa + (da * inv_sa) / 255;

    return (out_a << 24) | (out_b << 16) | (out_g << 8) | out_r;
}

static void clear_layer(layer_t *lay, uint32_t num_pixels) {
    if (!lay || !lay->pixels) return;
    for (uint32_t i = 0; i < num_pixels; i++) {
        lay->pixels[i] = 0x00000000;
    }
}

static int add_new_layer_internal(canvas_doc_t *doc) {
    if (!doc) return -1;
    uint32_t num_pixels = doc->width * doc->height;

    if (doc->layer_count >= doc->layer_capacity) {
        int new_cap = doc->layer_capacity == 0 ? 16 : (doc->layer_capacity * 2);
        layer_t *new_layers = (layer_t*)canvas_alloc(new_cap * sizeof(layer_t));
        for (int i = 0; i < doc->layer_count; i++) {
            new_layers[i] = doc->layers[i];
        }
        doc->layers = new_layers;
        doc->layer_capacity = new_cap;
    }

    int idx = doc->layer_count;
    doc->layers[idx].pixels = (uint32_t*)canvas_alloc(num_pixels * sizeof(uint32_t));
    doc->layers[idx].visible = 1;
    doc->layers[idx].opacity = 255;
    clear_layer(&doc->layers[idx], num_pixels);
    doc->layer_count++;
    doc->active_layer = idx;
    return idx;
}

static void composite_canvas(canvas_doc_t *doc) {
    if (!doc || !doc->out_pixels) return;
    uint32_t w = doc->width;
    uint32_t h = doc->height;
    uint32_t num_pixels = w * h;

    // Checkerboard pattern
    for (uint32_t y = 0; y < h; y++) {
        for (uint32_t x = 0; x < w; x++) {
            int check = ((x / 16) + (y / 16)) & 1;
            doc->out_pixels[y * w + x] = check ? 0xFF2A2A2A : 0xFF222222;
        }
    }

    for (int l = 0; l < doc->layer_count; l++) {
        if (!doc->layers[l].visible || !doc->layers[l].pixels) continue;
        uint8_t op = doc->layers[l].opacity;
        if (op == 0) continue;

        for (uint32_t i = 0; i < num_pixels; i++) {
            uint32_t src = doc->layers[l].pixels[i];
            if ((src & 0xFF000000) == 0) continue;
            doc->out_pixels[i] = blend_pixel(doc->out_pixels[i], src, op);
        }
    }
}

static void sync_fb_to_active_canvas(void) {
    if (!fb || active_canvas < 0 || active_canvas >= canvas_count) return;
    canvas_doc_t *doc = &canvases[active_canvas];
    fb->width = doc->width;
    fb->height = doc->height;
    fb->pixels = (uint32_t)(uintptr_t)doc->out_pixels;
}

static int create_canvas_doc(const char *name, uint32_t width, uint32_t height) {
    if (canvas_count >= MAX_CANVASES_LIMIT) return -1;
    int idx = canvas_count;
    canvas_doc_t *doc = &canvases[idx];

    int i = 0;
    while (name && name[i] && i < 23) {
        doc->name[i] = name[i];
        i++;
    }
    doc->name[i] = '\0';

    doc->width = (width >= 16 && width <= 4096) ? width : DEFAULT_WIDTH;
    doc->height = (height >= 16 && height <= 4096) ? height : DEFAULT_HEIGHT;
    doc->layer_count = 0;
    doc->layer_capacity = 0;
    doc->layers = 0;
    doc->active_layer = 0;
    doc->out_pixels = (uint32_t*)canvas_alloc(doc->width * doc->height * sizeof(uint32_t));

    add_new_layer_internal(doc);
    composite_canvas(doc);

    canvas_count++;
    active_canvas = idx;
    sync_fb_to_active_canvas();
    return idx;
}

static void resize_canvas_doc(canvas_doc_t *doc, uint32_t new_w, uint32_t new_h) {
    if (!doc || new_w < 16 || new_h < 16 || new_w > 4096 || new_h > 4096) return;
    if (new_w == doc->width && new_h == doc->height) return;

    uint32_t old_w = doc->width;
    uint32_t old_h = doc->height;
    uint32_t new_pixels = new_w * new_h;

    // Allocate new composite buffer
    doc->out_pixels = (uint32_t*)canvas_alloc(new_pixels * sizeof(uint32_t));

    // Resize each layer and preserve overlapping content
    uint32_t copy_w = old_w < new_w ? old_w : new_w;
    uint32_t copy_h = old_h < new_h ? old_h : new_h;

    for (int l = 0; l < doc->layer_count; l++) {
        uint32_t *old_buf = doc->layers[l].pixels;
        uint32_t *new_buf = (uint32_t*)canvas_alloc(new_pixels * sizeof(uint32_t));

        for (uint32_t i = 0; i < new_pixels; i++) new_buf[i] = 0x00000000;

        if (old_buf) {
            for (uint32_t y = 0; y < copy_h; y++) {
                for (uint32_t x = 0; x < copy_w; x++) {
                    new_buf[y * new_w + x] = old_buf[y * old_w + x];
                }
            }
        }

        doc->layers[l].pixels = new_buf;
    }

    doc->width = new_w;
    doc->height = new_h;
    composite_canvas(doc);
    sync_fb_to_active_canvas();
}

static int duplicate_canvas_doc(int src_idx, const char *new_name) {
    if (canvas_count >= MAX_CANVASES_LIMIT) return -1;
    if (src_idx < 0 || src_idx >= canvas_count) src_idx = active_canvas;
    if (src_idx < 0 || src_idx >= canvas_count) return -1;

    canvas_doc_t *src = &canvases[src_idx];
    int dst_idx = canvas_count;
    canvas_doc_t *dst = &canvases[dst_idx];

    int i = 0;
    while (new_name && new_name[i] && i < 23) {
        dst->name[i] = new_name[i];
        i++;
    }
    if (i == 0) {
        int k = 0;
        while (src->name[k] && k < 18) { dst->name[k] = src->name[k]; k++; }
        const char *suf = "_copy";
        for (int s = 0; suf[s] && k < 23; s++) dst->name[k++] = suf[s];
        dst->name[k] = '\0';
    } else {
        dst->name[i] = '\0';
    }

    dst->width = src->width;
    dst->height = src->height;
    dst->layer_count = src->layer_count;
    dst->layer_capacity = src->layer_count > 0 ? src->layer_count : 16;
    dst->active_layer = src->active_layer;

    uint32_t num_pixels = dst->width * dst->height;
    dst->out_pixels = (uint32_t*)canvas_alloc(num_pixels * sizeof(uint32_t));

    dst->layers = (layer_t*)canvas_alloc(dst->layer_capacity * sizeof(layer_t));
    for (int l = 0; l < src->layer_count; l++) {
        dst->layers[l].visible = src->layers[l].visible;
        dst->layers[l].opacity = src->layers[l].opacity;
        dst->layers[l].pixels = (uint32_t*)canvas_alloc(num_pixels * sizeof(uint32_t));
        if (src->layers[l].pixels) {
            for (uint32_t p = 0; p < num_pixels; p++) {
                dst->layers[l].pixels[p] = src->layers[l].pixels[p];
            }
        } else {
            clear_layer(&dst->layers[l], num_pixels);
        }
    }

    composite_canvas(dst);
    canvas_count++;
    active_canvas = dst_idx;
    sync_fb_to_active_canvas();
    return dst_idx;
}

static void draw_line(canvas_doc_t *doc, int x0, int y0, int x1, int y1, uint32_t color) {
    if (!doc || doc->active_layer < 0 || doc->active_layer >= doc->layer_count || !doc->layers[doc->active_layer].pixels) return;
    int w = doc->width;
    int h = doc->height;
    uint32_t *pix = doc->layers[doc->active_layer].pixels;

    int dx = (x1 > x0) ? (x1 - x0) : (x0 - x1);
    int dy = (y1 > y0) ? (y1 - y0) : (y0 - y1);
    int sx = (x0 < x1) ? 1 : -1;
    int sy = (y0 < y1) ? 1 : -1;
    int err = dx - dy;

    while (1) {
        if (x0 >= 0 && x0 < w && y0 >= 0 && y0 < h) {
            pix[y0 * w + x0] = color;
        }
        if (x0 == x1 && y0 == y1) break;
        int e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx)  { err += dx; y0 += sy; }
    }
}

void on_message(int32_t from_id, int32_t len) {
    if (len < 4) return;
    uint32_t type = *(uint32_t*)piolho_page;
    canvas_doc_t *doc = (active_canvas >= 0 && active_canvas < canvas_count) ? &canvases[active_canvas] : 0;

    switch (type) {
        case MSG_CANVAS_NEW: {
            if (len >= 12) {
                wesenho_canvas_new_msg_t *nmsg = (wesenho_canvas_new_msg_t*)piolho_page;
                create_canvas_doc((len >= 13 && nmsg->name[0]) ? nmsg->name : "canvas", nmsg->width, nmsg->height);
            }
            break;
        }
        case MSG_CANVAS_DUPLICATE: {
            int src_idx = -1;
            const char *new_name = 0;
            if (len >= 8) {
                src_idx = *(int32_t*)(piolho_page + 4);
            }
            if (len >= 9) {
                new_name = (const char*)(piolho_page + 8);
            }
            duplicate_canvas_doc(src_idx, new_name);
            break;
        }
        case MSG_CANVAS_SELECT: {
            if (len >= 4) {
                wesenho_canvas_select_msg_t *smsg = (wesenho_canvas_select_msg_t*)piolho_page;
                int sel_idx = (len >= 8) ? smsg->canvas_idx : -1;
                if (sel_idx >= 0 && sel_idx < canvas_count) {
                    active_canvas = sel_idx;
                    sync_fb_to_active_canvas();
                } else if (len >= 9 && smsg->name[0]) {
                    for (int c = 0; c < canvas_count; c++) {
                        int match = 1;
                        for (int k = 0; smsg->name[k] || canvases[c].name[k]; k++) {
                            if (smsg->name[k] != canvases[c].name[k]) { match = 0; break; }
                        }
                        if (match) {
                            active_canvas = c;
                            sync_fb_to_active_canvas();
                            break;
                        }
                    }
                }
            }
            break;
        }
        case MSG_CANVAS_RESIZE: {
            if (len >= 12 && doc) {
                wesenho_canvas_resize_msg_t *rmsg = (wesenho_canvas_resize_msg_t*)piolho_page;
                resize_canvas_doc(doc, rmsg->width, rmsg->height);
            }
            break;
        }
        case MSG_CANVAS_DELETE: {
            int del_idx = -1;
            if (len >= 8) {
                wesenho_canvas_select_msg_t *dmsg = (wesenho_canvas_select_msg_t*)piolho_page;
                del_idx = dmsg->canvas_idx;
                if (del_idx < 0 && len >= 9 && dmsg->name[0]) {
                    for (int c = 0; c < canvas_count; c++) {
                        int match = 1;
                        for (int k = 0; dmsg->name[k] || canvases[c].name[k]; k++) {
                            if (dmsg->name[k] != canvases[c].name[k]) { match = 0; break; }
                        }
                        if (match) { del_idx = c; break; }
                    }
                }
            }
            // If no target specified, delete current active canvas
            if (del_idx < 0) del_idx = active_canvas;

            if (del_idx >= 0 && del_idx < canvas_count) {
                if (canvas_count > 1) {
                    for (int c = del_idx; c < canvas_count - 1; c++) {
                        canvases[c] = canvases[c + 1];
                    }
                    canvas_count--;
                    if (active_canvas >= canvas_count) active_canvas = canvas_count - 1;
                    sync_fb_to_active_canvas();
                } else {
                    // Only 1 canvas left: reset it
                    for (int l = 0; l < canvases[0].layer_count; l++) {
                        clear_layer(&canvases[0].layers[l], canvases[0].width * canvases[0].height);
                    }
                    composite_canvas(&canvases[0]);
                    sync_fb_to_active_canvas();
                }
            }
            break;
        }
        case MSG_CANVAS_RENAME: {
            if (len >= 8) {
                wesenho_canvas_rename_msg_t *rnmsg = (wesenho_canvas_rename_msg_t*)piolho_page;
                int target_c = (rnmsg->canvas_idx >= 0 && rnmsg->canvas_idx < canvas_count) ? rnmsg->canvas_idx : active_canvas;
                if (target_c >= 0 && target_c < canvas_count && len >= 9) {
                    int i = 0;
                    while (rnmsg->name[i] && i < 23) {
                        canvases[target_c].name[i] = rnmsg->name[i];
                        i++;
                    }
                    canvases[target_c].name[i] = '\0';
                }
            }
            break;
        }
        case MSG_SET_COLOR:
            current_color = *(uint32_t*)(piolho_page + 4);
            break;
        case MSG_EFFECT_CLEAR:
            if (doc && doc->active_layer >= 0 && doc->active_layer < doc->layer_count) {
                clear_layer(&doc->layers[doc->active_layer], doc->width * doc->height);
            }
            break;
        case MSG_LAYER_ADD:
            if (doc) add_new_layer_internal(doc);
            break;
        case MSG_LAYER_SELECT: {
            int lay_idx = *(int32_t*)(piolho_page + 4);
            if (doc && lay_idx >= 0 && lay_idx < doc->layer_count) {
                doc->active_layer = lay_idx;
            }
            break;
        }
        case MSG_LAYER_TOGGLE_VIS: {
            int lay_idx = *(int32_t*)(piolho_page + 4);
            if (doc && lay_idx >= 0 && lay_idx < doc->layer_count) {
                doc->layers[lay_idx].visible = !doc->layers[lay_idx].visible;
            }
            break;
        }
        case MSG_LAYER_SET_OPACITY: {
            int lay_idx = *(int32_t*)(piolho_page + 4);
            int op = *(int32_t*)(piolho_page + 8);
            if (doc && lay_idx >= 0 && lay_idx < doc->layer_count) {
                if (op < 0) op = 0; if (op > 100) op = 100;
                doc->layers[lay_idx].opacity = (uint8_t)((op * 255) / 100);
            }
            break;
        }
        case MSG_LAYER_DELETE: {
            int del_idx = *(int32_t*)(piolho_page + 4);
            if (doc && del_idx >= 0 && del_idx < doc->layer_count) {
                if (doc->layer_count > 1) {
                    uint32_t *recycled = doc->layers[del_idx].pixels;
                    for (int l = del_idx; l < doc->layer_count - 1; l++) {
                        doc->layers[l] = doc->layers[l + 1];
                    }
                    doc->layers[doc->layer_count - 1].pixels = recycled;
                    clear_layer(&doc->layers[doc->layer_count - 1], doc->width * doc->height);
                    doc->layer_count--;
                    if (doc->active_layer >= doc->layer_count) doc->active_layer = doc->layer_count - 1;
                } else {
                    clear_layer(&doc->layers[0], doc->width * doc->height);
                }
            }
            break;
        }
        case MSG_DRAW_LINE: {
            if (!doc) break;
            int x0 = (int16_t)(*(uint32_t*)(piolho_page + 4) >> 16);
            int y0 = (int16_t)(*(uint32_t*)(piolho_page + 4) & 0xFFFF);
            int x1 = (int16_t)(*(uint32_t*)(piolho_page + 8) >> 16);
            int y1 = (int16_t)(*(uint32_t*)(piolho_page + 8) & 0xFFFF);
            draw_line(doc, x0, y0, x1, y1, current_color);
            break;
        }
        case MSG_DRAW_RECT: {
            if (!doc || doc->active_layer < 0 || doc->active_layer >= doc->layer_count || !doc->layers[doc->active_layer].pixels) break;
            int rx = (int16_t)(*(uint32_t*)(piolho_page + 4) >> 16);
            int ry = (int16_t)(*(uint32_t*)(piolho_page + 4) & 0xFFFF);
            int rw = (int16_t)(*(uint32_t*)(piolho_page + 8) >> 16);
            int rh = (int16_t)(*(uint32_t*)(piolho_page + 8) & 0xFFFF);
            uint32_t *pix = doc->layers[doc->active_layer].pixels;
            for (int dy = 0; dy < rh; dy++) {
                int py = ry + dy;
                if (py < 0 || py >= (int)doc->height) continue;
                for (int dx = 0; dx < rw; dx++) {
                    int px = rx + dx;
                    if (px < 0 || px >= (int)doc->width) continue;
                    pix[py * doc->width + px] = current_color;
                }
            }
            break;
        }
        case MSG_DRAW_CIRCLE: {
            if (!doc || doc->active_layer < 0 || doc->active_layer >= doc->layer_count || !doc->layers[doc->active_layer].pixels) break;
            int cx = (int16_t)(*(uint32_t*)(piolho_page + 4) >> 16);
            int cy = (int16_t)(*(uint32_t*)(piolho_page + 4) & 0xFFFF);
            int cr = (int)(*(uint32_t*)(piolho_page + 8));
            int r2 = cr * cr;
            uint32_t *pix = doc->layers[doc->active_layer].pixels;
            for (int dy = -cr; dy <= cr; dy++) {
                int py = cy + dy;
                if (py < 0 || py >= (int)doc->height) continue;
                for (int dx = -cr; dx <= cr; dx++) {
                    int px = cx + dx;
                    if (px < 0 || px >= (int)doc->width) continue;
                    if (dx * dx + dy * dy <= r2) {
                        pix[py * doc->width + px] = current_color;
                    }
                }
            }
            break;
        }
        case MSG_DRAW_GRID: {
            if (!doc || doc->active_layer < 0 || doc->active_layer >= doc->layer_count || !doc->layers[doc->active_layer].pixels) break;
            int step = (int)(*(uint32_t*)(piolho_page + 4));
            if (step < 4) step = 4;
            uint32_t *pix = doc->layers[doc->active_layer].pixels;
            for (uint32_t y = 0; y < doc->height; y += step) {
                for (uint32_t x = 0; x < doc->width; x++) {
                    pix[y * doc->width + x] = current_color;
                }
            }
            for (uint32_t x = 0; x < doc->width; x += step) {
                for (uint32_t y = 0; y < doc->height; y++) {
                    pix[y * doc->width + x] = current_color;
                }
            }
            break;
        }
    }
}

int32_t update(void) {
    if (!fb) {
        fb = (wframebuffer_t*)ask("std:framebuffer");
        create_canvas_doc("canvas_0", DEFAULT_WIDTH, DEFAULT_HEIGHT);
    }

    if (active_canvas >= 0 && active_canvas < canvas_count) {
        composite_canvas(&canvases[active_canvas]);
        sync_fb_to_active_canvas();
    }
    return UPDATE_OK;
}

uint32_t *get_active_layer_pixels(void) {
    if (active_canvas >= 0 && active_canvas < canvas_count) {
        canvas_doc_t *doc = &canvases[active_canvas];
        if (doc->active_layer >= 0 && doc->active_layer < doc->layer_count && doc->layers) {
            return doc->layers[doc->active_layer].pixels;
        }
    }
    return 0;
}

uint32_t *get_layer_pixels(int32_t idx) {
    if (active_canvas >= 0 && active_canvas < canvas_count) {
        canvas_doc_t *doc = &canvases[active_canvas];
        if (idx >= 0 && idx < doc->layer_count && doc->layers) {
            return doc->layers[idx].pixels;
        }
    }
    return 0;
}

uint32_t *get_composite_pixels(void) {
    if (active_canvas >= 0 && active_canvas < canvas_count) {
        return canvases[active_canvas].out_pixels;
    }
    return 0;
}

int32_t get_active_layer(void) {
    return (active_canvas >= 0 && active_canvas < canvas_count) ? canvases[active_canvas].active_layer : 0;
}

int32_t get_layer_count(void) {
    return (active_canvas >= 0 && active_canvas < canvas_count) ? canvases[active_canvas].layer_count : 0;
}

int32_t get_canvas_width(void) {
    return (active_canvas >= 0 && active_canvas < canvas_count) ? canvases[active_canvas].width : DEFAULT_WIDTH;
}

int32_t get_canvas_height(void) {
    return (active_canvas >= 0 && active_canvas < canvas_count) ? canvases[active_canvas].height : DEFAULT_HEIGHT;
}

int32_t get_canvas_count(void) {
    return canvas_count;
}

int32_t get_active_canvas(void) {
    return active_canvas;
}

const char *get_canvas_name(int32_t idx) {
    if (idx >= 0 && idx < canvas_count) return canvases[idx].name;
    return "";
}

uint8_t get_layer_visible(int32_t idx) {
    if (active_canvas >= 0 && active_canvas < canvas_count) {
        if (idx >= 0 && idx < canvases[active_canvas].layer_count) {
            return canvases[active_canvas].layers[idx].visible;
        }
    }
    return 0;
}

uint8_t get_layer_opacity(int32_t idx) {
    if (active_canvas >= 0 && active_canvas < canvas_count) {
        if (idx >= 0 && idx < canvases[active_canvas].layer_count) {
            return canvases[active_canvas].layers[idx].opacity;
        }
    }
    return 0;
}

void force_composite(void) {
    if (active_canvas >= 0 && active_canvas < canvas_count) {
        composite_canvas(&canvases[active_canvas]);
        sync_fb_to_active_canvas();
    }
}

