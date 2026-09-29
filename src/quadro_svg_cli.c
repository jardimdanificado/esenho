#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "quadro_svg.h"
#include "stb_image_write.h"

static void print_usage(const char *prog_name) {
    printf("Quadro SVG Standalone Native Runtime v2.0.0 (Zero Browser Dependency)\n");
    printf("Supports Gradients, Textures, Shading, Shadows, Brush Dynamics & DopeSheet\n\n");
    printf("Usage: %s <input.svg> [options]\n\n", prog_name);
    printf("Options:\n");
    printf("  -o, --output <path>            Output PNG file path (default: output.png)\n");
    printf("  -s, --scale <float>            Rasterization scale multiplier (default: 1.0)\n");
    printf("  -w, --width <pixels>           Override raster image width\n");
    printf("  -h, --height <pixels>          Override raster image height\n");
    printf("  -t, --time <ms>                Evaluate animation at time in milliseconds\n");
    printf("  -f, --frame <int>              Evaluate animation at specific frame (assumes 30fps or doc fps)\n");
    printf("      --sequence <pat> <s> <e>   Render PNG animation sequence (pattern, start_ms, end_ms)\n");
    printf("      --fps <float>              Framerate for sequence export (default: 30.0)\n");
    printf("      --brush <preset|.myb>      Apply brush preset or .myb file to strokes (e.g. deevad/brush.myb)\n");
    printf("      --brush-scale <float>      Brush dab size multiplier (default: 1.0)\n");
    printf("      --brush-pressure <float>   Brush stroke pressure (default: 0.8)\n");
    printf("      --fill-brush <.myb>        Fill vector paths with authentic MyPaint brush (e.g. tanda/watercolor-02-paint.myb)\n");
    printf("      --fill-pattern <pat>       Fill pattern mode: wash (default), crosshatch, stipple\n");
    printf("      --texture <mode>           Apply Quadro procedural texture (paper, canvas, noise, smoke, crosshatch, halftone, watercolor, pastel, charcoal, wood, marble, grunge)\n");
    printf("      --texture-scale <float>    Procedural texture scale (default: 100.0)\n");
    printf("      --texture-contrast <float> Procedural texture contrast (default: 100.0)\n");
    printf("      --texture-grain <float>    Procedural texture grain (default: 50.0)\n");
    printf("      --dump-info                Print document scene tree and properties\n");
    printf("  -v, --verbose                  Verbose output\n");
    printf("      --help                     Show this help message\n");
}

static int parse_brush_preset_name(const char *name) {
    if (!name) return 0;
    if (strcmp(name, "inker") == 0) return 1;
    if (strcmp(name, "pencil") == 0) return 2;
    if (strcmp(name, "charcoal") == 0) return 3;
    if (strcmp(name, "chisel") == 0) return 4;
    if (strcmp(name, "watercolor") == 0) return 5;
    return 0;
}

static int parse_texture_mode_name(const char *name) {
    if (!name) return 0;
    if (strcmp(name, "paper") == 0) return 1;
    if (strcmp(name, "canvas") == 0) return 2;
    if (strcmp(name, "noise") == 0) return 3;
    if (strcmp(name, "smoke") == 0) return 4;
    if (strcmp(name, "crosshatch") == 0) return 5;
    if (strcmp(name, "halftone") == 0) return 6;
    if (strcmp(name, "watercolor") == 0) return 7;
    if (strcmp(name, "pastel") == 0 || strcmp(name, "rough_pastel") == 0) return 8;
    if (strcmp(name, "charcoal") == 0 || strcmp(name, "charcoal_tooth") == 0) return 9;
    if (strcmp(name, "wood") == 0) return 10;
    if (strcmp(name, "marble") == 0) return 11;
    if (strcmp(name, "grunge") == 0) return 12;
    return atoi(name);
}

int main(int argc, char **argv) {
    if (argc < 2) {
        print_usage(argv[0]);
        return 1;
    }

    const char *input_path = NULL;
    const char *output_path = "output.png";
    const char *seq_pattern = NULL;
    float seq_start = 0.0f;
    float seq_end = 0.0f;
    float fps = 30.0f;
    float eval_time = -1.0f;
    float scale = 1.0f;
    int override_w = 0;
    int override_h = 0;
    int verbose = 0;
    int dump_info = 0;
    quadro_svg_render_options_t render_opts = {0};

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
        } else if (strcmp(argv[i], "-t") == 0 || strcmp(argv[i], "--time") == 0) {
            if (i + 1 < argc) eval_time = (float)atof(argv[++i]);
        } else if (strcmp(argv[i], "-f") == 0 || strcmp(argv[i], "--frame") == 0) {
            if (i + 1 < argc) {
                int f = atoi(argv[++i]);
                eval_time = (f * 1000.0f) / fps;
            }
        } else if (strcmp(argv[i], "--fps") == 0) {
            if (i + 1 < argc) fps = (float)atof(argv[++i]);
        } else if (strcmp(argv[i], "--brush") == 0) {
            if (i + 1 < argc) {
                const char *b_arg = argv[++i];
                int p_num = parse_brush_preset_name(b_arg);
                if (p_num > 0) {
                    render_opts.brush_preset = p_num;
                } else {
                    strncpy(render_opts.mypaint_brush_file, b_arg, sizeof(render_opts.mypaint_brush_file) - 1);
                }
            }
        } else if (strcmp(argv[i], "--brush-scale") == 0) {
            if (i + 1 < argc) render_opts.brush_size_scale = (float)atof(argv[++i]);
        } else if (strcmp(argv[i], "--brush-pressure") == 0) {
            if (i + 1 < argc) {
                /* Set pressure if needed */
                float p = (float)atof(argv[++i]);
                (void)p;
            }
        } else if (strcmp(argv[i], "--fill-brush") == 0) {
            if (i + 1 < argc) {
                strncpy(render_opts.mypaint_fill_brush, argv[++i], sizeof(render_opts.mypaint_fill_brush) - 1);
            }
        } else if (strcmp(argv[i], "--fill-pattern") == 0) {
            if (i + 1 < argc) {
                const char *pat = argv[++i];
                if (strcmp(pat, "crosshatch") == 0 || strcmp(pat, "2") == 0) render_opts.mypaint_fill_pattern = 2;
                else if (strcmp(pat, "stipple") == 0 || strcmp(pat, "3") == 0) render_opts.mypaint_fill_pattern = 3;
                else render_opts.mypaint_fill_pattern = 1;
            }
        } else if (strcmp(argv[i], "--texture") == 0) {
            if (i + 1 < argc) render_opts.texture_mode = parse_texture_mode_name(argv[++i]);
        } else if (strcmp(argv[i], "--texture-scale") == 0) {
            if (i + 1 < argc) render_opts.texture_scale = (float)atof(argv[++i]);
        } else if (strcmp(argv[i], "--texture-contrast") == 0) {
            if (i + 1 < argc) render_opts.texture_contrast = (float)atof(argv[++i]);
        } else if (strcmp(argv[i], "--texture-grain") == 0) {
            if (i + 1 < argc) render_opts.texture_grain = (float)atof(argv[++i]);
        } else if (strcmp(argv[i], "--sequence") == 0) {
            if (i + 3 < argc) {
                seq_pattern = argv[++i];
                seq_start = (float)atof(argv[++i]);
                seq_end = (float)atof(argv[++i]);
            }
        } else if (strcmp(argv[i], "--dump-info") == 0) {
            dump_info = 1;
        } else if (strcmp(argv[i], "-v") == 0 || strcmp(argv[i], "--verbose") == 0) {
            verbose = 1;
        } else if (!input_path && argv[i][0] != '-') {
            input_path = argv[i];
        } else if (input_path && (strcmp(output_path, "output.png") == 0) && argv[i][0] != '-') {
            output_path = argv[i];
        }
    }

    if (!input_path) {
        fprintf(stderr, "Error: No input SVG file specified.\n");
        return 1;
    }

    if (verbose || dump_info) {
        printf("[quadro-svg] Loading: %s\n", input_path);
    }

    quadro_svg_doc_t *doc = quadro_svg_parse_file(input_path);
    if (!doc) {
        fprintf(stderr, "Error: Failed to parse SVG file: %s\n", input_path);
        return 1;
    }

    if (dump_info || verbose) {
        printf("[quadro-svg] Canvas: %.1fx%.1f (viewBox: %.1f %.1f %.1f %.1f)\n",
               doc->width, doc->height, doc->vb_x, doc->vb_y, doc->vb_w, doc->vb_h);
        int grad_count = 0;
        for (quadro_svg_gradient_t *g = doc->gradients; g != NULL; g = g->next) grad_count++;
        printf("[quadro-svg] Active Gradients: %d\n", grad_count);
    }

    if (seq_pattern) {
        if (verbose) {
            printf("[quadro-svg] Exporting Animation Sequence: %s (%.1fms to %.1fms @ %.1ffps)\n",
                   seq_pattern, seq_start, seq_end, fps);
        }
        int ok = quadro_svg_render_sequence(input_path, seq_pattern, seq_start, seq_end, fps, scale);
        quadro_svg_doc_free(doc);
        if (ok) {
            printf("[quadro-svg] Animation sequence rendered successfully!\n");
            return 0;
        } else {
            fprintf(stderr, "Error: Sequence rendering failed.\n");
            return 1;
        }
    }

    int out_w = override_w > 0 ? override_w : (int)(doc->width * scale);
    int out_h = override_h > 0 ? override_h : (int)(doc->height * scale);

    quadro_svg_set_global_options(&render_opts);

    if (eval_time >= 0.0f) {
        quadro_svg_doc_evaluate_time(doc, eval_time);
        if (verbose) printf("[quadro-svg] Evaluated frame at time: %.2fms\n", eval_time);
    }

    uint32_t *rgba_buffer = (uint32_t*)malloc(out_w * out_h * sizeof(uint32_t));
    int ok = quadro_svg_render(doc, rgba_buffer, out_w, out_h, scale);

    if (ok) {
        ok = stbi_write_png(output_path, out_w, out_h, 4, rgba_buffer, out_w * 4);
    }

    free(rgba_buffer);
    quadro_svg_doc_free(doc);

    if (ok) {
        printf("[quadro-svg] Rendered successfully -> %s (%dx%d, scale=%.2f)\n", output_path, out_w, out_h, scale);
        return 0;
    } else {
        fprintf(stderr, "Error: Rendering failed.\n");
        return 1;
    }
}
