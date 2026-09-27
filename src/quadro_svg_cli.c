#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "quadro_svg.h"

static void print_usage(const char *prog_name) {
    printf("Quadro SVG Standalone Native Runtime v1.0.0 (Zero Browser Dependency)\n");
    printf("Usage: %s <input.svg> [options]\n\n", prog_name);
    printf("Options:\n");
    printf("  -o, --output <path>    Output PNG file path (default: output.png)\n");
    printf("  -s, --scale <float>    Rasterization scale multiplier (default: 1.0)\n");
    printf("  -w, --width <pixels>   Override raster image width\n");
    printf("  -h, --height <pixels>  Override raster image height\n");
    printf("  -v, --verbose          Print document properties and timing\n");
    printf("      --help             Show this help message\n");
}

int main(int argc, char **argv) {
    if (argc < 2) {
        print_usage(argv[0]);
        return 1;
    }

    const char *input_path = NULL;
    const char *output_path = "output.png";
    float scale = 1.0f;
    int override_w = 0;
    int override_h = 0;
    int verbose = 0;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--help") == 0) {
            print_usage(argv[0]);
            return 0;
        } else if (strcmp(argv[i], "-o") == 0 || strcmp(argv[i], "--output") == 0) {
            if (i + 1 < argc) output_path = argv[++i];
        } else if (strcmp(argv[i], "-s") == 0 || strcmp(argv[i], "--scale") == 0) {
            if (i + 1 < argc) scale = (float)atof(argv[++i]);
        } else if (strcmp(argv[i], "-w") == 0 || strcmp(argv[i], "--width") == 0) {
            if (i + 1 < argc) override_w = atoi(argv[++i]);
        } else if (strcmp(argv[i], "-h") == 0 || strcmp(argv[i], "--height") == 0) {
            if (i + 1 < argc) override_h = atoi(argv[++i]);
        } else if (strcmp(argv[i], "-v") == 0 || strcmp(argv[i], "--verbose") == 0) {
            verbose = 1;
        } else if (!input_path && argv[i][0] != '-') {
            input_path = argv[i];
        }
    }

    if (!input_path) {
        fprintf(stderr, "Error: No input SVG file specified.\n");
        return 1;
    }

    if (verbose) {
        printf("[quadro-svg] Parsing: %s\n", input_path);
    }

    quadro_svg_doc_t *doc = quadro_svg_parse_file(input_path);
    if (!doc) {
        fprintf(stderr, "Error: Failed to parse SVG file: %s\n", input_path);
        return 1;
    }

    int out_w = override_w > 0 ? override_w : (int)(doc->width * scale);
    int out_h = override_h > 0 ? override_h : (int)(doc->height * scale);

    if (verbose) {
        printf("[quadro-svg] SVG Document Dimensions: %.1fx%.1f (viewBox: %.1f %.1f %.1f %.1f)\n",
               doc->width, doc->height, doc->vb_x, doc->vb_y, doc->vb_w, doc->vb_h);
        printf("[quadro-svg] Output Target: %s (%dx%d, scale=%.2f)\n", output_path, out_w, out_h, scale);
    }

    int ok = quadro_svg_render_to_file(input_path, output_path, scale, override_w, override_h);
    quadro_svg_doc_free(doc);

    if (ok) {
        printf("[quadro-svg] Rendered successfully -> %s (%dx%d)\n", output_path, out_w, out_h);
        return 0;
    } else {
        fprintf(stderr, "Error: Rendering failed.\n");
        return 1;
    }
}
