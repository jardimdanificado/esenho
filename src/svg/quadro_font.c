#include "quadro_svg.h"
#include <math.h>
#include <string.h>
#include <stdlib.h>

/* Helper to transform point by 2D Affine Matrix */
static inline void transform_point(const quadro_matrix_t *mat, float x, float y, float *ox, float *oy) {
    if (!mat) {
        *ox = x;
        *oy = y;
        return;
    }
    *ox = mat->a * x + mat->c * y + mat->e;
    *oy = mat->b * x + mat->d * y + mat->f;
}

/* Vector Glyph Segment Types */
enum {
    VG_MOVE = 0,
    VG_LINE = 1,
    VG_QUAD = 2,
    VG_CUBIC = 3,
    VG_CLOSE = 4,
    VG_END = 5
};

typedef struct {
    uint8_t type;
    float x1, y1;
    float x2, y2;
    float x3, y3;
} vglyph_cmd_t;

/* High quality scalable vector stroke outlines for alphanumeric & symbols */
/* Normalized coordinate space: Y=0 top of capital, Y=1 baseline, X advance usually 0.6 */

static const vglyph_cmd_t GLYPH_A[] = {
    { VG_MOVE, 0.05f, 1.0f }, { VG_LINE, 0.30f, 0.0f }, { VG_LINE, 0.55f, 1.0f },
    { VG_MOVE, 0.15f, 0.65f }, { VG_LINE, 0.45f, 0.65f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_B[] = {
    { VG_MOVE, 0.10f, 1.0f }, { VG_LINE, 0.10f, 0.0f }, { VG_LINE, 0.35f, 0.0f },
    { VG_CUBIC, 0.52f, 0.0f, 0.52f, 0.45f, 0.35f, 0.45f },
    { VG_LINE, 0.10f, 0.45f }, { VG_LINE, 0.40f, 0.45f },
    { VG_CUBIC, 0.58f, 0.45f, 0.58f, 1.0f, 0.35f, 1.0f },
    { VG_LINE, 0.10f, 1.0f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_C[] = {
    { VG_MOVE, 0.55f, 0.18f },
    { VG_CUBIC, 0.45f, 0.0f, 0.10f, 0.0f, 0.10f, 0.50f },
    { VG_CUBIC, 0.10f, 1.0f, 0.45f, 1.0f, 0.55f, 0.82f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_D[] = {
    { VG_MOVE, 0.10f, 1.0f }, { VG_LINE, 0.10f, 0.0f }, { VG_LINE, 0.30f, 0.0f },
    { VG_CUBIC, 0.58f, 0.0f, 0.58f, 1.0f, 0.30f, 1.0f },
    { VG_LINE, 0.10f, 1.0f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_E[] = {
    { VG_MOVE, 0.52f, 0.0f }, { VG_LINE, 0.10f, 0.0f }, { VG_LINE, 0.10f, 1.0f }, { VG_LINE, 0.52f, 1.0f },
    { VG_MOVE, 0.10f, 0.50f }, { VG_LINE, 0.42f, 0.50f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_F[] = {
    { VG_MOVE, 0.10f, 1.0f }, { VG_LINE, 0.10f, 0.0f }, { VG_LINE, 0.52f, 0.0f },
    { VG_MOVE, 0.10f, 0.50f }, { VG_LINE, 0.42f, 0.50f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_G[] = {
    { VG_MOVE, 0.55f, 0.18f },
    { VG_CUBIC, 0.45f, 0.0f, 0.10f, 0.0f, 0.10f, 0.50f },
    { VG_CUBIC, 0.10f, 1.0f, 0.45f, 1.0f, 0.55f, 0.82f },
    { VG_LINE, 0.55f, 0.50f }, { VG_LINE, 0.35f, 0.50f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_H[] = {
    { VG_MOVE, 0.10f, 0.0f }, { VG_LINE, 0.10f, 1.0f },
    { VG_MOVE, 0.50f, 0.0f }, { VG_LINE, 0.50f, 1.0f },
    { VG_MOVE, 0.10f, 0.50f }, { VG_LINE, 0.50f, 0.50f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_I[] = {
    { VG_MOVE, 0.10f, 0.0f }, { VG_LINE, 0.30f, 0.0f },
    { VG_MOVE, 0.20f, 0.0f }, { VG_LINE, 0.20f, 1.0f },
    { VG_MOVE, 0.10f, 1.0f }, { VG_LINE, 0.30f, 1.0f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_J[] = {
    { VG_MOVE, 0.10f, 0.70f }, { VG_CUBIC, 0.10f, 1.0f, 0.40f, 1.0f, 0.40f, 0.70f },
    { VG_LINE, 0.40f, 0.0f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_K[] = {
    { VG_MOVE, 0.10f, 0.0f }, { VG_LINE, 0.10f, 1.0f },
    { VG_MOVE, 0.50f, 0.0f }, { VG_LINE, 0.10f, 0.55f }, { VG_LINE, 0.50f, 1.0f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_L[] = {
    { VG_MOVE, 0.10f, 0.0f }, { VG_LINE, 0.10f, 1.0f }, { VG_LINE, 0.48f, 1.0f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_M[] = {
    { VG_MOVE, 0.08f, 1.0f }, { VG_LINE, 0.08f, 0.0f }, { VG_LINE, 0.32f, 0.65f },
    { VG_LINE, 0.56f, 0.0f }, { VG_LINE, 0.56f, 1.0f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_N[] = {
    { VG_MOVE, 0.10f, 1.0f }, { VG_LINE, 0.10f, 0.0f }, { VG_LINE, 0.50f, 1.0f }, { VG_LINE, 0.50f, 0.0f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_O[] = {
    { VG_MOVE, 0.30f, 0.0f },
    { VG_CUBIC, 0.10f, 0.0f, 0.10f, 1.0f, 0.30f, 1.0f },
    { VG_CUBIC, 0.50f, 1.0f, 0.50f, 0.0f, 0.30f, 0.0f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_P[] = {
    { VG_MOVE, 0.10f, 1.0f }, { VG_LINE, 0.10f, 0.0f }, { VG_LINE, 0.35f, 0.0f },
    { VG_CUBIC, 0.55f, 0.0f, 0.55f, 0.55f, 0.35f, 0.55f },
    { VG_LINE, 0.10f, 0.55f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_Q[] = {
    { VG_MOVE, 0.30f, 0.0f },
    { VG_CUBIC, 0.10f, 0.0f, 0.10f, 1.0f, 0.30f, 1.0f },
    { VG_CUBIC, 0.50f, 1.0f, 0.50f, 0.0f, 0.30f, 0.0f },
    { VG_MOVE, 0.35f, 0.75f }, { VG_LINE, 0.55f, 1.15f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_R[] = {
    { VG_MOVE, 0.10f, 1.0f }, { VG_LINE, 0.10f, 0.0f }, { VG_LINE, 0.35f, 0.0f },
    { VG_CUBIC, 0.55f, 0.0f, 0.55f, 0.52f, 0.35f, 0.52f },
    { VG_LINE, 0.10f, 0.52f },
    { VG_MOVE, 0.30f, 0.52f }, { VG_LINE, 0.52f, 1.0f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_S[] = {
    { VG_MOVE, 0.50f, 0.18f },
    { VG_CUBIC, 0.40f, 0.0f, 0.12f, 0.05f, 0.12f, 0.30f },
    { VG_CUBIC, 0.12f, 0.55f, 0.48f, 0.45f, 0.48f, 0.75f },
    { VG_CUBIC, 0.48f, 1.0f, 0.15f, 1.0f, 0.08f, 0.82f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_T[] = {
    { VG_MOVE, 0.05f, 0.0f }, { VG_LINE, 0.55f, 0.0f },
    { VG_MOVE, 0.30f, 0.0f }, { VG_LINE, 0.30f, 1.0f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_U[] = {
    { VG_MOVE, 0.10f, 0.0f }, { VG_LINE, 0.10f, 0.70f },
    { VG_CUBIC, 0.10f, 1.0f, 0.50f, 1.0f, 0.50f, 0.70f },
    { VG_LINE, 0.50f, 0.0f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_V[] = {
    { VG_MOVE, 0.05f, 0.0f }, { VG_LINE, 0.30f, 1.0f }, { VG_LINE, 0.55f, 0.0f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_W[] = {
    { VG_MOVE, 0.05f, 0.0f }, { VG_LINE, 0.20f, 1.0f }, { VG_LINE, 0.35f, 0.35f },
    { VG_LINE, 0.50f, 1.0f }, { VG_LINE, 0.65f, 0.0f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_X[] = {
    { VG_MOVE, 0.08f, 0.0f }, { VG_LINE, 0.52f, 1.0f },
    { VG_MOVE, 0.52f, 0.0f }, { VG_LINE, 0.08f, 1.0f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_Y[] = {
    { VG_MOVE, 0.08f, 0.0f }, { VG_LINE, 0.30f, 0.50f }, { VG_LINE, 0.52f, 0.0f },
    { VG_MOVE, 0.30f, 0.50f }, { VG_LINE, 0.30f, 1.0f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_Z[] = {
    { VG_MOVE, 0.08f, 0.0f }, { VG_LINE, 0.52f, 0.0f }, { VG_LINE, 0.08f, 1.0f }, { VG_LINE, 0.52f, 1.0f },
    { VG_END }
};

/* Digits 0..9 */
static const vglyph_cmd_t GLYPH_0[] = {
    { VG_MOVE, 0.30f, 0.0f },
    { VG_CUBIC, 0.10f, 0.0f, 0.10f, 1.0f, 0.30f, 1.0f },
    { VG_CUBIC, 0.50f, 1.0f, 0.50f, 0.0f, 0.30f, 0.0f },
    { VG_MOVE, 0.45f, 0.15f }, { VG_LINE, 0.15f, 0.85f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_1[] = {
    { VG_MOVE, 0.15f, 0.25f }, { VG_LINE, 0.30f, 0.0f }, { VG_LINE, 0.30f, 1.0f },
    { VG_MOVE, 0.15f, 1.0f }, { VG_LINE, 0.45f, 1.0f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_2[] = {
    { VG_MOVE, 0.10f, 0.25f }, { VG_CUBIC, 0.10f, 0.0f, 0.50f, 0.0f, 0.50f, 0.30f },
    { VG_LINE, 0.10f, 1.0f }, { VG_LINE, 0.50f, 1.0f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_3[] = {
    { VG_MOVE, 0.10f, 0.15f }, { VG_LINE, 0.50f, 0.0f }, { VG_LINE, 0.28f, 0.45f },
    { VG_CUBIC, 0.52f, 0.45f, 0.52f, 1.0f, 0.25f, 1.0f },
    { VG_CUBIC, 0.12f, 1.0f, 0.08f, 0.85f, 0.08f, 0.85f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_4[] = {
    { VG_MOVE, 0.40f, 1.0f }, { VG_LINE, 0.40f, 0.0f }, { VG_LINE, 0.08f, 0.65f }, { VG_LINE, 0.52f, 0.65f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_5[] = {
    { VG_MOVE, 0.48f, 0.0f }, { VG_LINE, 0.12f, 0.0f }, { VG_LINE, 0.10f, 0.45f },
    { VG_CUBIC, 0.20f, 0.40f, 0.50f, 0.42f, 0.50f, 0.72f },
    { VG_CUBIC, 0.50f, 1.0f, 0.12f, 1.0f, 0.08f, 0.82f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_6[] = {
    { VG_MOVE, 0.45f, 0.15f }, { VG_CUBIC, 0.25f, 0.0f, 0.10f, 0.30f, 0.10f, 0.65f },
    { VG_CUBIC, 0.10f, 1.0f, 0.50f, 1.0f, 0.50f, 0.65f },
    { VG_CUBIC, 0.50f, 0.42f, 0.15f, 0.42f, 0.10f, 0.65f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_7[] = {
    { VG_MOVE, 0.08f, 0.0f }, { VG_LINE, 0.52f, 0.0f }, { VG_LINE, 0.22f, 1.0f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_8[] = {
    { VG_MOVE, 0.30f, 0.48f },
    { VG_CUBIC, 0.12f, 0.48f, 0.12f, 0.0f, 0.30f, 0.0f },
    { VG_CUBIC, 0.48f, 0.0f, 0.48f, 0.48f, 0.30f, 0.48f },
    { VG_CUBIC, 0.08f, 0.48f, 0.08f, 1.0f, 0.30f, 1.0f },
    { VG_CUBIC, 0.52f, 1.0f, 0.52f, 0.48f, 0.30f, 0.48f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_9[] = {
    { VG_MOVE, 0.50f, 0.35f },
    { VG_CUBIC, 0.50f, 0.0f, 0.10f, 0.0f, 0.10f, 0.35f },
    { VG_CUBIC, 0.10f, 0.60f, 0.45f, 0.60f, 0.50f, 0.35f },
    { VG_LINE, 0.50f, 0.60f },
    { VG_CUBIC, 0.50f, 1.0f, 0.20f, 1.0f, 0.12f, 0.85f },
    { VG_END }
};

/* Punctuation */
static const vglyph_cmd_t GLYPH_DOT[] = {
    { VG_MOVE, 0.15f, 0.95f }, { VG_LINE, 0.25f, 0.95f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_MINUS[] = {
    { VG_MOVE, 0.10f, 0.50f }, { VG_LINE, 0.45f, 0.50f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_PLUS[] = {
    { VG_MOVE, 0.10f, 0.50f }, { VG_LINE, 0.50f, 0.50f },
    { VG_MOVE, 0.30f, 0.25f }, { VG_LINE, 0.30f, 0.75f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_SLASH[] = {
    { VG_MOVE, 0.08f, 1.0f }, { VG_LINE, 0.45f, 0.0f },
    { VG_END }
};

static const vglyph_cmd_t GLYPH_COLON[] = {
    { VG_MOVE, 0.15f, 0.35f }, { VG_LINE, 0.25f, 0.35f },
    { VG_MOVE, 0.15f, 0.75f }, { VG_LINE, 0.25f, 0.75f },
    { VG_END }
};

static const vglyph_cmd_t* get_vglyph(char c, float *out_advance) {
    if (c >= 'a' && c <= 'z') c = c - 'a' + 'A';
    *out_advance = 0.60f;
    switch (c) {
        case 'A': return GLYPH_A;
        case 'B': return GLYPH_B;
        case 'C': return GLYPH_C;
        case 'D': return GLYPH_D;
        case 'E': return GLYPH_E;
        case 'F': return GLYPH_F;
        case 'G': return GLYPH_G;
        case 'H': return GLYPH_H;
        case 'I': *out_advance = 0.35f; return GLYPH_I;
        case 'J': *out_advance = 0.45f; return GLYPH_J;
        case 'K': return GLYPH_K;
        case 'L': *out_advance = 0.50f; return GLYPH_L;
        case 'M': *out_advance = 0.68f; return GLYPH_M;
        case 'N': return GLYPH_N;
        case 'O': return GLYPH_O;
        case 'P': return GLYPH_P;
        case 'Q': return GLYPH_Q;
        case 'R': return GLYPH_R;
        case 'S': return GLYPH_S;
        case 'T': return GLYPH_T;
        case 'U': return GLYPH_U;
        case 'V': return GLYPH_V;
        case 'W': *out_advance = 0.72f; return GLYPH_W;
        case 'X': return GLYPH_X;
        case 'Y': return GLYPH_Y;
        case 'Z': return GLYPH_Z;
        case '0': return GLYPH_0;
        case '1': *out_advance = 0.45f; return GLYPH_1;
        case '2': return GLYPH_2;
        case '3': return GLYPH_3;
        case '4': return GLYPH_4;
        case '5': return GLYPH_5;
        case '6': return GLYPH_6;
        case '7': return GLYPH_7;
        case '8': return GLYPH_8;
        case '9': return GLYPH_9;
        case '.': *out_advance = 0.30f; return GLYPH_DOT;
        case '-': *out_advance = 0.50f; return GLYPH_MINUS;
        case '+': *out_advance = 0.55f; return GLYPH_PLUS;
        case '/': *out_advance = 0.50f; return GLYPH_SLASH;
        case ':': *out_advance = 0.30f; return GLYPH_COLON;
        case ' ': *out_advance = 0.35f; return NULL;
        default: return NULL;
    }
}

/* Measure string total width */
static float measure_text_width(const char *text, float font_size) {
    if (!text) return 0.0f;
    float total_w = 0.0f;
    for (size_t i = 0; text[i]; i++) {
        float adv = 0.60f;
        get_vglyph(text[i], &adv);
        total_w += adv * font_size;
    }
    return total_w;
}

/* Convert string into vector paths using w_path_* API */
void quadro_text_to_path(const char *text, float x, float y, float font_size, int text_anchor, const quadro_matrix_t *mat) {
    if (!text || font_size <= 0.0f) return;
    
    float total_w = measure_text_width(text, font_size);
    float pen_x = x;
    if (text_anchor == 1) { /* middle */
        pen_x -= total_w * 0.5f;
    } else if (text_anchor == 2) { /* end */
        pen_x -= total_w;
    }
    
    float pen_y = y - font_size; /* Baseline adjustment */
    
    for (size_t i = 0; text[i]; i++) {
        char c = text[i];
        float adv = 0.60f;
        const vglyph_cmd_t *cmds = get_vglyph(c, &adv);
        
        if (cmds) {
            for (int k = 0; cmds[k].type != VG_END; k++) {
                const vglyph_cmd_t *cmd = &cmds[k];
                if (cmd->type == VG_MOVE) {
                    float px = pen_x + cmd->x1 * font_size;
                    float py = pen_y + cmd->y1 * font_size;
                    float tx, ty;
                    transform_point(mat, px, py, &tx, &ty);
                    w_path_move_to(tx, ty);
                } else if (cmd->type == VG_LINE) {
                    float px = pen_x + cmd->x1 * font_size;
                    float py = pen_y + cmd->y1 * font_size;
                    float tx, ty;
                    transform_point(mat, px, py, &tx, &ty);
                    w_path_line_to(tx, ty);
                } else if (cmd->type == VG_QUAD) {
                    float cx = pen_x + cmd->x1 * font_size;
                    float cy = pen_y + cmd->y1 * font_size;
                    float px = pen_x + cmd->x2 * font_size;
                    float py = pen_y + cmd->y2 * font_size;
                    float tcx, tcy, tpx, tpy;
                    transform_point(mat, cx, cy, &tcx, &tcy);
                    transform_point(mat, px, py, &tpx, &tpy);
                    w_path_quad_to(tcx, tcy, tpx, tpy);
                } else if (cmd->type == VG_CUBIC) {
                    float c1x = pen_x + cmd->x1 * font_size;
                    float c1y = pen_y + cmd->y1 * font_size;
                    float c2x = pen_x + cmd->x2 * font_size;
                    float c2y = pen_y + cmd->y2 * font_size;
                    float px  = pen_x + cmd->x3 * font_size;
                    float py  = pen_y + cmd->y3 * font_size;
                    float tc1x, tc1y, tc2x, tc2y, tpx, tpy;
                    transform_point(mat, c1x, c1y, &tc1x, &tc1y);
                    transform_point(mat, c2x, c2y, &tc2x, &tc2y);
                    transform_point(mat, px, py, &tpx, &tpy);
                    w_path_cubic_to(tc1x, tc1y, tc2x, tc2y, tpx, tpy);
                } else if (cmd->type == VG_CLOSE) {
                    w_path_close();
                }
            }
        }
        pen_x += adv * font_size;
    }
}
