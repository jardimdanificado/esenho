/* stb_image_write - v1.16 - public domain - http://nothings.org/stb
   Image writer for PNG, BMP, TGA, JPG, HDR.
   Compact subset for PNG writing. */
#ifndef INCLUDE_STB_IMAGE_WRITE_H
#define INCLUDE_STB_IMAGE_WRITE_H

#include <stdlib.h>
#include <stdio.h>
#include <string.h>

#ifdef __cplusplus
extern "C" {
#endif

int stbi_write_png(char const *filename, int w, int h, int comp, const void *data, int stride_in_bytes);
int stbi_write_png_to_mem(const unsigned char *pixels, int stride_bytes, int x, int y, int n, int *out_len, unsigned char **out_buf);

#ifdef STB_IMAGE_WRITE_IMPLEMENTATION

static unsigned int stbiw__crc32(unsigned char *buffer, int len) {
    static unsigned int crc_table[256];
    static int crc_table_computed = 0;
    if (!crc_table_computed) {
        for (unsigned int n = 0; n < 256; n++) {
            unsigned int c = n;
            for (int k = 0; k < 8; k++) {
                if (c & 1) c = 0xedb88320L ^ (c >> 1);
                else c = c >> 1;
            }
            crc_table[n] = c;
        }
        crc_table_computed = 1;
    }
    unsigned int c = 0xffffffffL;
    for (int i = 0; i < len; i++) {
        c = crc_table[(c ^ buffer[i]) & 0xff] ^ (c >> 8);
    }
    return c ^ 0xffffffffL;
}

static unsigned int stbiw__adler32(unsigned char *data, int len) {
    unsigned int a = 1, b = 0;
    for (int i = 0; i < len; i++) {
        a = (a + data[i]) % 65521;
        b = (b + a) % 65521;
    }
    return (b << 16) | a;
}

static void stbiw__write32(FILE *f, unsigned int v) {
    fputc((v >> 24) & 0xff, f);
    fputc((v >> 16) & 0xff, f);
    fputc((v >> 8) & 0xff, f);
    fputc(v & 0xff, f);
}

static void stbiw__write_chunk(FILE *f, const char *type, unsigned char *data, int len) {
    stbiw__write32(f, len);
    unsigned char *chunk = (unsigned char*)malloc(len + 4);
    memcpy(chunk, type, 4);
    if (len > 0) memcpy(chunk + 4, data, len);
    fwrite(chunk, 1, len + 4, f);
    unsigned int crc = stbiw__crc32(chunk, len + 4);
    stbiw__write32(f, crc);
    free(chunk);
}

int stbi_write_png(char const *filename, int w, int h, int comp, const void *data, int stride_in_bytes) {
    if (stride_in_bytes == 0) stride_in_bytes = w * comp;
    FILE *f = fopen(filename, "wb");
    if (!f) return 0;

    // PNG signature
    unsigned char sig[8] = { 137, 80, 78, 71, 13, 10, 26, 10 };
    fwrite(sig, 1, 8, f);

    // IHDR
    unsigned char ihdr[13];
    ihdr[0] = (w >> 24) & 0xff; ihdr[1] = (w >> 16) & 0xff; ihdr[2] = (w >> 8) & 0xff; ihdr[3] = w & 0xff;
    ihdr[4] = (h >> 24) & 0xff; ihdr[5] = (h >> 16) & 0xff; ihdr[6] = (h >> 8) & 0xff; ihdr[7] = h & 0xff;
    ihdr[8] = 8; // 8-bit depth
    ihdr[9] = (comp == 4) ? 6 : ((comp == 3) ? 2 : ((comp == 2) ? 4 : 0)); // RGBA=6, RGB=2, L+A=4, L=0
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace
    stbiw__write_chunk(f, "IHDR", ihdr, 13);

    // Raw scanlines with filter byte 0 (None)
    int line_len = 1 + w * comp;
    int raw_len = line_len * h;
    unsigned char *raw_data = (unsigned char*)malloc(raw_len);
    const unsigned char *src = (const unsigned char*)data;

    for (int y = 0; y < h; y++) {
        raw_data[y * line_len] = 0; // filter byte = 0
        memcpy(&raw_data[y * line_len + 1], src + y * stride_in_bytes, w * comp);
    }

    // zlib uncompressed stream blocks (type 00)
    // max block size = 65535
    int num_blocks = (raw_len + 65534) / 65535;
    if (num_blocks == 0) num_blocks = 1;
    int zlib_len = 2 + num_blocks * 5 + raw_len + 4;
    unsigned char *zlib_data = (unsigned char*)malloc(zlib_len);
    int zp = 0;

    zlib_data[zp++] = 0x78; // CMF: Deflate, 32K window
    zlib_data[zp++] = 0x01; // FLG: FCHECK=1, no preset dict

    int bytes_left = raw_len;
    int src_offset = 0;
    while (bytes_left > 0 || zp == 2) {
        int block_size = bytes_left > 65535 ? 65535 : bytes_left;
        int is_final = (bytes_left <= 65535) ? 1 : 0;
        zlib_data[zp++] = is_final ? 0x01 : 0x00;
        zlib_data[zp++] = block_size & 0xff;
        zlib_data[zp++] = (block_size >> 8) & 0xff;
        zlib_data[zp++] = (~block_size) & 0xff;
        zlib_data[zp++] = ((~block_size) >> 8) & 0xff;

        if (block_size > 0) {
            memcpy(&zlib_data[zp], &raw_data[src_offset], block_size);
            zp += block_size;
            src_offset += block_size;
            bytes_left -= block_size;
        }
        if (bytes_left <= 0) break;
    }

    unsigned int adler = stbiw__adler32(raw_data, raw_len);
    zlib_data[zp++] = (adler >> 24) & 0xff;
    zlib_data[zp++] = (adler >> 16) & 0xff;
    zlib_data[zp++] = (adler >> 8) & 0xff;
    zlib_data[zp++] = adler & 0xff;

    stbiw__write_chunk(f, "IDAT", zlib_data, zp);
    stbiw__write_chunk(f, "IEND", NULL, 0);

    free(zlib_data);
    free(raw_data);
    fclose(f);
    return 1;
}

#endif // STB_IMAGE_WRITE_IMPLEMENTATION

#ifdef __cplusplus
}
#endif

#endif // INCLUDE_STB_IMAGE_WRITE_H
