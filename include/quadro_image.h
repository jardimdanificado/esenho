#ifndef QUADRO_IMAGE_H
#define QUADRO_IMAGE_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifndef W_EXPORT
#define W_EXPORT __attribute__((visibility("default")))
#endif

/**
 * =========================================================================
 * Quadro Native Image Decoder (QOI, BMP, TGA & Raw ARGB Bitstream)
 * Freestanding C99 implementation (Zero libc dependencies).
 * Allows loading and injecting image buffers directly into Quadro layers.
 * =========================================================================
 */

#ifdef __cplusplus
extern "C" {
#endif

/** QOI (Quite OK Image) 100% Freestanding Lossless Decoder */
#define W_QOI_MAGIC 0x716f6966 /* 'qoif' */

static inline int32_t w_image_decode_qoi(const uint8_t *data, uint32_t size, uint32_t *out_pixels, int32_t max_pixels, int32_t *out_w, int32_t *out_h) {
    if (size < 14 || !data || !out_pixels) return 0;

    uint32_t magic = (data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3];
    if (magic != W_QOI_MAGIC) return 0;

    int32_t width = (data[4] << 24) | (data[5] << 16) | (data[6] << 8) | data[7];
    int32_t height = (data[8] << 24) | (data[9] << 16) | (data[10] << 8) | data[11];
    uint8_t channels = data[12];
    (void)channels;

    if (width <= 0 || height <= 0 || width * height > max_pixels) return 0;

    if (out_w) *out_w = width;
    if (out_h) *out_h = height;

    uint32_t index[64] = {0};
    uint8_t r = 0, g = 0, b = 0, a = 255;
    int32_t total_pixels = width * height;
    int32_t pixel_idx = 0;
    uint32_t p_idx = 14;

    while (pixel_idx < total_pixels && p_idx < size) {
        uint8_t b1 = data[p_idx++];

        if (b1 == 0xFE) { /* QOI_OP_RGB */
            if (p_idx + 3 > size) break;
            r = data[p_idx++];
            g = data[p_idx++];
            b = data[p_idx++];
        } else if (b1 == 0xFF) { /* QOI_OP_RGBA */
            if (p_idx + 4 > size) break;
            r = data[p_idx++];
            g = data[p_idx++];
            b = data[p_idx++];
            a = data[p_idx++];
        } else if ((b1 & 0xC0) == 0x00) { /* QOI_OP_INDEX */
            uint32_t px = index[b1 & 0x3F];
            r = px & 0xFF;
            g = (px >> 8) & 0xFF;
            b = (px >> 16) & 0xFF;
            a = (px >> 24) & 0xFF;
        } else if ((b1 & 0xC0) == 0x40) { /* QOI_OP_DIFF */
            r += ((b1 >> 4) & 0x03) - 2;
            g += ((b1 >> 2) & 0x03) - 2;
            b += (b1 & 0x03) - 2;
        } else if ((b1 & 0xC0) == 0x80) { /* QOI_OP_LUMA */
            if (p_idx >= size) break;
            uint8_t b2 = data[p_idx++];
            int vg = (b1 & 0x3F) - 32;
            r += vg - 8 + ((b2 >> 4) & 0x0F);
            g += vg;
            b += vg - 8 + (b2 & 0x0F);
        } else if ((b1 & 0xC0) == 0xC0) { /* QOI_OP_RUN */
            int run = (b1 & 0x3F);
            uint32_t cur_col = (a << 24) | (b << 16) | (g << 8) | r;
            for (int i = 0; i <= run && pixel_idx < total_pixels; i++) {
                out_pixels[pixel_idx++] = cur_col;
            }
            continue;
        }

        uint32_t cur_col = (a << 24) | (b << 16) | (g << 8) | r;
        int idx_pos = (r * 3 + g * 5 + b * 7 + a * 11) % 64;
        index[idx_pos] = cur_col;
        out_pixels[pixel_idx++] = cur_col;
    }

    return pixel_idx;
}

/** BMP (Windows Bitmap 24/32-bit uncompressed) Decoder */
static inline int32_t w_image_decode_bmp(const uint8_t *data, uint32_t size, uint32_t *out_pixels, int32_t max_pixels, int32_t *out_w, int32_t *out_h) {
    if (size < 54 || !data || !out_pixels) return 0;
    if (data[0] != 'B' || data[1] != 'M') return 0;

    uint32_t data_offset = data[10] | (data[11] << 8) | (data[12] << 16) | (data[13] << 24);
    int32_t width = (int32_t)(data[18] | (data[19] << 8) | (data[20] << 16) | (data[21] << 24));
    int32_t height = (int32_t)(data[22] | (data[23] << 8) | (data[24] << 16) | (data[25] << 24));
    uint16_t bpp = data[28] | (data[29] << 8);

    if (width <= 0 || height == 0 || bpp < 24) return 0;
    bool flip_y = height > 0;
    if (height < 0) height = -height;

    if (width * height > max_pixels) return 0;
    if (out_w) *out_w = width;
    if (out_h) *out_h = height;

    uint32_t row_bytes = ((width * (bpp / 8) + 3) / 4) * 4;
    int bytes_per_pixel = bpp / 8;

    for (int y = 0; y < height; y++) {
        int dst_y = flip_y ? (height - 1 - y) : y;
        uint32_t row_start = data_offset + y * row_bytes;
        if (row_start >= size) break;

        for (int x = 0; x < width; x++) {
            uint32_t px_offset = row_start + x * bytes_per_pixel;
            if (px_offset + bytes_per_pixel > size) break;

            uint8_t b = data[px_offset + 0];
            uint8_t g = data[px_offset + 1];
            uint8_t r = data[px_offset + 2];
            uint8_t a = (bytes_per_pixel == 4) ? data[px_offset + 3] : 255;

            out_pixels[dst_y * width + x] = (a << 24) | (b << 16) | (g << 8) | r;
        }
    }

    return width * height;
}

/** TGA (Truevision Targa 24/32-bit uncompressed) Decoder */
static inline int32_t w_image_decode_tga(const uint8_t *data, uint32_t size, uint32_t *out_pixels, int32_t max_pixels, int32_t *out_w, int32_t *out_h) {
    if (size < 18 || !data || !out_pixels) return 0;
    uint8_t id_len = data[0];
    uint8_t image_type = data[2];
    if (image_type != 2) return 0; /* Uncompressed true-color */

    int32_t width = data[12] | (data[13] << 8);
    int32_t height = data[14] | (data[15] << 8);
    uint8_t bpp = data[16];
    uint8_t descriptor = data[17];
    bool flip_y = (descriptor & 0x20) == 0;

    if (width <= 0 || height <= 0 || (bpp != 24 && bpp != 32)) return 0;
    if (width * height > max_pixels) return 0;

    if (out_w) *out_w = width;
    if (out_h) *out_h = height;

    int bytes_per_pixel = bpp / 8;
    uint32_t offset = 18 + id_len;

    for (int y = 0; y < height; y++) {
        int dst_y = flip_y ? (height - 1 - y) : y;
        for (int x = 0; x < width; x++) {
            if (offset + bytes_per_pixel > size) break;
            uint8_t b = data[offset + 0];
            uint8_t g = data[offset + 1];
            uint8_t r = data[offset + 2];
            uint8_t a = (bytes_per_pixel == 4) ? data[offset + 3] : 255;
            offset += bytes_per_pixel;

            out_pixels[dst_y * width + x] = (a << 24) | (b << 16) | (g << 8) | r;
        }
    }

    return width * height;
}

/** Universal Image Decoder: detects format automatically (QOI, BMP, TGA) */
static inline int32_t w_image_decode_auto(const uint8_t *data, uint32_t size, uint32_t *out_pixels, int32_t max_pixels, int32_t *out_w, int32_t *out_h) {
    if (!data || size < 4 || !out_pixels) return 0;

    /* 1. Try QOI */
    if (size >= 14 && data[0] == 'q' && data[1] == 'o' && data[2] == 'i' && data[3] == 'f') {
        return w_image_decode_qoi(data, size, out_pixels, max_pixels, out_w, out_h);
    }
    /* 2. Try BMP */
    if (size >= 54 && data[0] == 'B' && data[1] == 'M') {
        return w_image_decode_bmp(data, size, out_pixels, max_pixels, out_w, out_h);
    }
    /* 3. Try TGA */
    if (size >= 18 && (data[2] == 2)) {
        return w_image_decode_tga(data, size, out_pixels, max_pixels, out_w, out_h);
    }

    return 0;
}

/** Universal Image Dimensions Probe (header-only, zero decoding) */
static inline int32_t w_image_get_dimensions(const uint8_t *data, uint32_t size, int32_t *out_w, int32_t *out_h) {
    if (!data || size < 14) return 0;

    /* 1. Try QOI */
    if (size >= 14 && data[0] == 'q' && data[1] == 'o' && data[2] == 'i' && data[3] == 'f') {
        int32_t w = (data[4] << 24) | (data[5] << 16) | (data[6] << 8) | data[7];
        int32_t h = (data[8] << 24) | (data[9] << 16) | (data[10] << 8) | data[11];
        if (w > 0 && h > 0) {
            if (out_w) *out_w = w;
            if (out_h) *out_h = h;
            return 1;
        }
    }

    /* 2. Try BMP */
    if (size >= 26 && data[0] == 'B' && data[1] == 'M') {
        int32_t w = (int32_t)(data[18] | (data[19] << 8) | (data[20] << 16) | (data[21] << 24));
        int32_t h = (int32_t)(data[22] | (data[23] << 8) | (data[24] << 16) | (data[25] << 24));
        if (h < 0) h = -h;
        if (w > 0 && h > 0) {
            if (out_w) *out_w = w;
            if (out_h) *out_h = h;
            return 1;
        }
    }

    /* 3. Try TGA */
    if (size >= 18 && (data[2] == 2)) {
        int32_t w = data[12] | (data[13] << 8);
        int32_t h = data[14] | (data[15] << 8);
        if (w > 0 && h > 0) {
            if (out_w) *out_w = w;
            if (out_h) *out_h = h;
            return 1;
        }
    }

    return 0;
}

#ifdef __cplusplus
}
#endif

#endif /* QUADRO_IMAGE_H */

