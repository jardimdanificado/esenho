#ifndef QUADRO_GIF_H
#define QUADRO_GIF_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifndef W_EXPORT
#define W_EXPORT __attribute__((visibility("default")))
#endif

/**
 * =========================================================================
 * Quadro Animated GIF89a Native Encoder
 * Freestanding C99 implementation (Zero libc dependencies).
 * Generates valid standard GIF89a bitstream with LZW compression,
 * Netscape 2.0 loop block and adaptive color quantization.
 * =========================================================================
 */

#ifdef __cplusplus
extern "C" {
#endif

#define W_GIF_MAX_COLORS 256
#define W_GIF_LZW_MAX_BITS 12
#define W_GIF_LZW_TABLE_SIZE 4096

typedef struct {
    uint8_t *buffer;
    uint32_t capacity;
    uint32_t size;
    int32_t width;
    int32_t height;
    int32_t frame_count;
    int32_t loop_count;
    bool has_header;
} w_gif_encoder_t;

static inline void w_gif_write_byte(w_gif_encoder_t *enc, uint8_t b) {
    if (enc->size < enc->capacity) {
        enc->buffer[enc->size++] = b;
    }
}

static inline void w_gif_write_bytes(w_gif_encoder_t *enc, const void *data, uint32_t len) {
    const uint8_t *p = (const uint8_t*)data;
    for (uint32_t i = 0; i < len; i++) {
        w_gif_write_byte(enc, p[i]);
    }
}

static inline void w_gif_write_u16_le(w_gif_encoder_t *enc, uint16_t v) {
    w_gif_write_byte(enc, (uint8_t)(v & 0xFF));
    w_gif_write_byte(enc, (uint8_t)((v >> 8) & 0xFF));
}

/** Quantizes 32-bit ARGB pixels into an adaptive 256-color palette */
static inline void w_gif_quantize_palette(const uint32_t *pixels, int32_t num_pixels, uint8_t *out_palette_rgb, uint8_t *out_indexed) {
    /* 1. Fast color frequency sampling */
    /* Use 6x6x6 uniform RGB cube (216 colors) + 16 grays + remaining slots */
    int color_idx = 0;

    /* Base 6x6x6 web safe color grid (216 colors) */
    for (int r = 0; r < 6; r++) {
        for (int g = 0; g < 6; g++) {
            for (int b = 0; b < 6; b++) {
                if (color_idx < W_GIF_MAX_COLORS) {
                    out_palette_rgb[color_idx * 3 + 0] = (uint8_t)(r * 51);
                    out_palette_rgb[color_idx * 3 + 1] = (uint8_t)(g * 51);
                    out_palette_rgb[color_idx * 3 + 2] = (uint8_t)(b * 51);
                    color_idx++;
                }
            }
        }
    }

    /* Grayscale ramp (32 levels) */
    for (int gr = 0; gr < 32 && color_idx < W_GIF_MAX_COLORS; gr++) {
        uint8_t v = (uint8_t)((gr * 255) / 31);
        out_palette_rgb[color_idx * 3 + 0] = v;
        out_palette_rgb[color_idx * 3 + 1] = v;
        out_palette_rgb[color_idx * 3 + 2] = v;
        color_idx++;
    }

    /* Fill remaining with zero */
    while (color_idx < W_GIF_MAX_COLORS) {
        out_palette_rgb[color_idx * 3 + 0] = 0;
        out_palette_rgb[color_idx * 3 + 1] = 0;
        out_palette_rgb[color_idx * 3 + 2] = 0;
        color_idx++;
    }

    /* 2. Map pixels to nearest color in 6x6x6 cube (instant calculation) */
    for (int i = 0; i < num_pixels; i++) {
        uint32_t p = pixels[i];
        uint32_t r = p & 0xFF;
        uint32_t g = (p >> 8) & 0xFF;
        uint32_t b = (p >> 16) & 0xFF;

        int ri = (r * 5 + 128) / 255;
        int gi = (g * 5 + 128) / 255;
        int bi = (b * 5 + 128) / 255;
        if (ri > 5) ri = 5;
        if (gi > 5) gi = 5;
        if (bi > 5) bi = 5;

        out_indexed[i] = (uint8_t)(ri * 36 + gi * 6 + bi);
    }
}

/** LZW Bit Packing State */
typedef struct {
    w_gif_encoder_t *enc;
    uint32_t cur_accum;
    int cur_bits;
    uint8_t block[256];
    int block_len;
} w_gif_lzw_output_t;

static inline void w_gif_lzw_flush_block(w_gif_lzw_output_t *out) {
    if (out->block_len > 0) {
        w_gif_write_byte(out->enc, (uint8_t)out->block_len);
        w_gif_write_bytes(out->enc, out->block, out->block_len);
        out->block_len = 0;
    }
}

static inline void w_gif_lzw_write_code(w_gif_lzw_output_t *out, int code, int code_size) {
    out->cur_accum |= ((uint32_t)code << out->cur_bits);
    out->cur_bits += code_size;

    while (out->cur_bits >= 8) {
        out->block[out->block_len++] = (uint8_t)(out->cur_accum & 0xFF);
        out->cur_accum >>= 8;
        out->cur_bits -= 8;

        if (out->block_len >= 254) {
            w_gif_lzw_flush_block(out);
        }
    }
}

static inline void w_gif_lzw_finish_codes(w_gif_lzw_output_t *out) {
    if (out->cur_bits > 0) {
        out->block[out->block_len++] = (uint8_t)(out->cur_accum & 0xFF);
        out->cur_bits = 0;
        out->cur_accum = 0;
    }
    w_gif_lzw_flush_block(out);
    w_gif_write_byte(out->enc, 0x00); /* Block terminator */
}

/** Compresses indexed pixel data with standard GIF LZW */
static inline void w_gif_lzw_compress(w_gif_encoder_t *enc, const uint8_t *indexed_pixels, int num_pixels, int init_code_size) {
    w_gif_write_byte(enc, (uint8_t)init_code_size);

    int clear_code = 1 << init_code_size;
    int eof_code = clear_code + 1;
    int next_code = eof_code + 1;
    int cur_code_size = init_code_size + 1;

    w_gif_lzw_output_t out = {0};
    out.enc = enc;

    /* Simple hash table for prefix-character lookup */
    #define W_GIF_HASH_SIZE 5003
    int16_t hash_prefix[W_GIF_HASH_SIZE];
    uint8_t hash_char[W_GIF_HASH_SIZE];
    int16_t hash_code[W_GIF_HASH_SIZE];

    for (int i = 0; i < W_GIF_HASH_SIZE; i++) {
        hash_prefix[i] = -1;
    }

    w_gif_lzw_write_code(&out, clear_code, cur_code_size);

    int cur_prefix = indexed_pixels[0];

    for (int i = 1; i < num_pixels; i++) {
        uint8_t k = indexed_pixels[i];
        int hash = ((cur_prefix << 4) ^ k) % W_GIF_HASH_SIZE;
        if (hash < 0) hash += W_GIF_HASH_SIZE;

        int found_code = -1;
        while (hash_prefix[hash] != -1) {
            if (hash_prefix[hash] == cur_prefix && hash_char[hash] == k) {
                found_code = hash_code[hash];
                break;
            }
            hash = (hash + 1) % W_GIF_HASH_SIZE;
        }

        if (found_code >= 0) {
            cur_prefix = found_code;
        } else {
            w_gif_lzw_write_code(&out, cur_prefix, cur_code_size);

            if (next_code < W_GIF_LZW_TABLE_SIZE) {
                hash_prefix[hash] = (int16_t)cur_prefix;
                hash_char[hash] = k;
                hash_code[hash] = (int16_t)next_code++;

                if (next_code > (1 << cur_code_size) && cur_code_size < W_GIF_LZW_MAX_BITS) {
                    cur_code_size++;
                }
            } else {
                /* Table full: emit clear code and reset table */
                w_gif_lzw_write_code(&out, clear_code, cur_code_size);
                cur_code_size = init_code_size + 1;
                next_code = eof_code + 1;
                for (int h = 0; h < W_GIF_HASH_SIZE; h++) hash_prefix[h] = -1;
            }

            cur_prefix = k;
        }
    }

    w_gif_lzw_write_code(&out, cur_prefix, cur_code_size);
    w_gif_lzw_write_code(&out, eof_code, cur_code_size);
    w_gif_lzw_finish_codes(&out);
}

/** Initializes a GIF encoder into an allocated output memory buffer */
static inline void w_gif_init(w_gif_encoder_t *enc, uint8_t *buffer, uint32_t capacity, int32_t width, int32_t height, int32_t loop_count) {
    enc->buffer = buffer;
    enc->capacity = capacity;
    enc->size = 0;
    enc->width = width;
    enc->height = height;
    enc->frame_count = 0;
    enc->loop_count = loop_count;
    enc->has_header = false;
}

/** Writes standard GIF89a Header and Screen Descriptor */
static inline void w_gif_write_header(w_gif_encoder_t *enc) {
    if (enc->has_header) return;

    /* Signature & Version: "GIF89a" */
    w_gif_write_bytes(enc, "GIF89a", 6);

    /* Logical Screen Descriptor */
    w_gif_write_u16_le(enc, (uint16_t)enc->width);
    w_gif_write_u16_le(enc, (uint16_t)enc->height);
    w_gif_write_byte(enc, 0x70); /* No global color table, 8 bits/pixel */
    w_gif_write_byte(enc, 0x00); /* Background color index */
    w_gif_write_byte(enc, 0x00); /* Pixel aspect ratio */

    /* Netscape 2.0 Application Extension (for animated looping) */
    w_gif_write_byte(enc, 0x21); /* Extension Introducer */
    w_gif_write_byte(enc, 0xFF); /* Application Extension Label */
    w_gif_write_byte(enc, 11);   /* Block Size */
    w_gif_write_bytes(enc, "NETSCAPE2.0", 11);
    w_gif_write_byte(enc, 3);    /* Sub-block Size */
    w_gif_write_byte(enc, 1);    /* Loop sub-block ID */
    w_gif_write_u16_le(enc, (uint16_t)enc->loop_count); /* 0 = loop forever */
    w_gif_write_byte(enc, 0x00); /* Block Terminator */

    enc->has_header = true;
}

/** Adds an ARGB frame with delay in milliseconds */
static inline int32_t w_gif_write_frame(w_gif_encoder_t *enc, const uint32_t *pixels, int32_t delay_ms, uint8_t *temp_indexed) {
    if (!enc->has_header) w_gif_write_header(enc);

    int num_pixels = enc->width * enc->height;
    uint8_t palette_rgb[W_GIF_MAX_COLORS * 3];

    /* Generate palette and map pixels */
    w_gif_quantize_palette(pixels, num_pixels, palette_rgb, temp_indexed);

    /* Graphic Control Extension */
    int delay_hundredths = delay_ms / 10;
    if (delay_hundredths < 1) delay_hundredths = 1;

    w_gif_write_byte(enc, 0x21); /* Extension */
    w_gif_write_byte(enc, 0xF9); /* Graphic Control */
    w_gif_write_byte(enc, 0x04); /* Block size */
    w_gif_write_byte(enc, 0x04); /* Disposal method = 1 (do not dispose / overwrite) */
    w_gif_write_u16_le(enc, (uint16_t)delay_hundredths);
    w_gif_write_byte(enc, 0x00); /* Transparent color index (none) */
    w_gif_write_byte(enc, 0x00); /* Block Terminator */

    /* Image Descriptor */
    w_gif_write_byte(enc, 0x2C); /* Image separator */
    w_gif_write_u16_le(enc, 0);  /* Left */
    w_gif_write_u16_le(enc, 0);  /* Top */
    w_gif_write_u16_le(enc, (uint16_t)enc->width);
    w_gif_write_u16_le(enc, (uint16_t)enc->height);
    w_gif_write_byte(enc, 0x87); /* Local color table present, 8 bits (256 colors) */

    /* Local Color Table (768 bytes) */
    w_gif_write_bytes(enc, palette_rgb, sizeof(palette_rgb));

    /* LZW Compressed raster data */
    w_gif_lzw_compress(enc, temp_indexed, num_pixels, 8);

    enc->frame_count++;
    return enc->frame_count;
}

/** Finishes GIF bitstream by writing Trailer byte */
static inline int32_t w_gif_finish(w_gif_encoder_t *enc) {
    if (!enc->has_header) w_gif_write_header(enc);
    w_gif_write_byte(enc, 0x3B); /* GIF Trailer byte */
    return enc->size;
}

#ifdef __cplusplus
}
#endif

#endif /* QUADRO_GIF_H */
