#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include <string.h>
#include <math.h>
#include "quadro_svg.h"

static void test_svg_parser_and_shapes(void) {
    printf("--- 1. Testing C SVG Parser & Node Graph ---\n");
    const char *xml = 
        "<svg width=\"400\" height=\"300\" viewBox=\"0 0 400 300\">\n"
        "  <g id=\"group1\" transform=\"translate(20, 30)\">\n"
        "    <rect id=\"r1\" x=\"10\" y=\"10\" width=\"100\" height=\"50\" fill=\"#fe8019\" stroke=\"#fabd2f\" stroke-width=\"3\" />\n"
        "    <circle id=\"c1\" cx=\"150\" cy=\"70\" r=\"30\" fill=\"#b8bb26\" />\n"
        "    <ellipse id=\"e1\" cx=\"250\" cy=\"80\" rx=\"40\" ry=\"20\" fill=\"#83a598\" />\n"
        "    <line id=\"l1\" x1=\"0\" y1=\"150\" x2=\"300\" y2=\"150\" stroke=\"#d3869b\" stroke-width=\"2\" />\n"
        "    <polygon id=\"p1\" points=\"50,180 80,240 20,240\" fill=\"#8ec07c\" />\n"
        "    <path id=\"pth1\" d=\"M 120 200 C 140 180, 160 240, 180 200 S 220 240, 240 200\" stroke=\"#ebdbb2\" stroke-width=\"4\" fill=\"none\" />\n"
        "    <text id=\"t1\" x=\"50\" y=\"280\" font-size=\"20\" fill=\"#fbf1c7\">WESENHO SVG</text>\n"
        "  </g>\n"
        "</svg>";

    quadro_svg_doc_t *doc = quadro_svg_parse_string(xml, strlen(xml));
    assert(doc != NULL);
    assert(doc->width == 400.0f);
    assert(doc->height == 300.0f);
    assert(doc->has_viewbox == 1);
    assert(doc->root != NULL);
    assert(doc->root->type == QUADRO_SVG_GROUP);
    assert(strcmp(doc->root->id, "group1") == 0);

    /* Verify children */
    quadro_svg_node_t *ch = doc->root->children;
    assert(ch != NULL && ch->type == QUADRO_SVG_RECT);
    assert(ch->geom.rect.w == 100.0f);
    assert(ch->style.has_fill == 1);
    assert((ch->style.fill_color & 0xFF) == 0xfe); // R
    assert(((ch->style.fill_color >> 16) & 0xFF) == 0x19); // B

    ch = ch->next;
    assert(ch != NULL && ch->type == QUADRO_SVG_CIRCLE);
    assert(ch->geom.circle.r == 30.0f);

    ch = ch->next;
    assert(ch != NULL && ch->type == QUADRO_SVG_ELLIPSE);

    ch = ch->next;
    assert(ch != NULL && ch->type == QUADRO_SVG_LINE);

    ch = ch->next;
    assert(ch != NULL && ch->type == QUADRO_SVG_POLYGON);

    ch = ch->next;
    assert(ch != NULL && ch->type == QUADRO_SVG_PATH);
    assert(ch->geom.path.d != NULL);

    ch = ch->next;
    assert(ch != NULL && ch->type == QUADRO_SVG_TEXT);
    assert(ch->text_content != NULL && strcmp(ch->text_content, "WESENHO SVG") == 0);

    printf("✔ SVG scene graph and element hierarchy verified successfully!\n");
    quadro_svg_doc_free(doc);
}

static void test_svg_render_memory(void) {
    printf("--- 2. Testing C SVG Memory Rasterization ---\n");
    const char *xml = 
        "<svg width=\"200\" height=\"200\">\n"
        "  <rect x=\"20\" y=\"20\" width=\"160\" height=\"160\" fill=\"#ff0000\" />\n"
        "  <circle cx=\"100\" cy=\"100\" r=\"50\" fill=\"#00ff00\" />\n"
        "</svg>";

    quadro_svg_doc_t *doc = quadro_svg_parse_string(xml, strlen(xml));
    assert(doc != NULL);

    uint32_t pixels[200 * 200];
    memset(pixels, 0, sizeof(pixels));

    int ok = quadro_svg_render(doc, pixels, 200, 200, 1.0f);
    assert(ok == 1);

    /* Check center pixel (circle color green) */
    uint32_t center_pix = pixels[100 * 200 + 100];
    uint8_t a = (center_pix >> 24) & 0xFF;
    uint8_t g = (center_pix >> 8) & 0xFF;
    assert(a > 200);
    assert(g > 200);

    /* Check corner inside rect (rect color red) */
    uint32_t rect_pix = pixels[30 * 200 + 30];
    uint8_t ra = (rect_pix >> 24) & 0xFF;
    uint8_t rr = rect_pix & 0xFF;
    assert(ra > 200);
    assert(rr > 200);

    printf("✔ In-memory scanline rasterization verified!\n");
    quadro_svg_doc_free(doc);
}

static void test_svg_gradients(void) {
    printf("--- 3. Testing Linear & Radial Multi-Stop Gradients ---\n");
    const char *xml =
        "<svg width=\"300\" height=\"300\">\n"
        "  <defs>\n"
        "    <linearGradient id=\"gradLinear\" x1=\"0%\" y1=\"0%\" x2=\"100%\" y2=\"100%\">\n"
        "      <stop offset=\"0%\" stop-color=\"#ff0000\" stop-opacity=\"1.0\" />\n"
        "      <stop offset=\"50%\" stop-color=\"#00ff00\" stop-opacity=\"1.0\" />\n"
        "      <stop offset=\"100%\" stop-color=\"#0000ff\" stop-opacity=\"1.0\" />\n"
        "    </linearGradient>\n"
        "    <radialGradient id=\"gradRadial\" cx=\"50%\" cy=\"50%\" r=\"50%\">\n"
        "      <stop offset=\"0%\" stop-color=\"#ffff00\" />\n"
        "      <stop offset=\"100%\" stop-color=\"#ff00ff\" />\n"
        "    </radialGradient>\n"
        "  </defs>\n"
        "  <rect x=\"10\" y=\"10\" width=\"120\" height=\"120\" fill=\"url(#gradLinear)\" />\n"
        "  <circle cx=\"200\" cy=\"200\" r=\"60\" fill=\"url(#gradRadial)\" />\n"
        "</svg>";

    quadro_svg_doc_t *doc = quadro_svg_parse_string(xml, strlen(xml));
    assert(doc != NULL);
    assert(doc->gradients != NULL);

    uint32_t pixels[300 * 300];
    memset(pixels, 0, sizeof(pixels));

    int ok = quadro_svg_render(doc, pixels, 300, 300, 1.0f);
    assert(ok == 1);

    /* Linear Gradient check at rect center */
    uint32_t lin_mid = pixels[70 * 300 + 70];
    uint8_t a = (lin_mid >> 24) & 0xFF;
    assert(a > 200);

    /* Radial Gradient check at circle center (yellow) */
    uint32_t rad_center = pixels[200 * 300 + 200];
    uint8_t ra = (rad_center >> 24) & 0xFF;
    uint8_t rr = rad_center & 0xFF;
    uint8_t rg = (rad_center >> 8) & 0xFF;
    assert(ra > 200);
    assert(rr > 200 && rg > 200); // Yellow: Red + Green

    printf("✔ Linear and Radial multi-stop gradient rasterization verified!\n");
    quadro_svg_doc_free(doc);
}

static void test_svg_procedural_textures(void) {
    printf("--- 4. Testing Procedural Textures & Shading ---\n");
    /* Direct procedural texture sampling verification */
    uint8_t paper = quadro_sample_procedural_texture(1 /* Paper */, 50, 50, 0, 100, 100, 255);
    assert(paper > 0);

    uint8_t noise = quadro_sample_procedural_texture(3 /* Noise */, 123, 456, 0, 100, 100, 255);
    assert(noise > 0);

    uint8_t charcoal = quadro_sample_procedural_texture(9 /* Charcoal */, 88, 99, 45, 150, 120, 255);
    assert(charcoal > 0);

    /* Test via SVG document parsing and rendering */
    const char *xml =
        "<svg width=\"200\" height=\"200\">\n"
        "  <rect x=\"20\" y=\"20\" width=\"160\" height=\"160\" fill=\"#fe8019\"\n"
        "        data-fill-tex='mode:9,scale:150,contrast:120' />\n"
        "</svg>";

    quadro_svg_doc_t *doc = quadro_svg_parse_string(xml, strlen(xml));
    assert(doc != NULL);
    assert(doc->root != NULL);
    assert(doc->root->style.fill_texture.enabled == 1);
    assert(doc->root->style.fill_texture.mode == 9);

    uint32_t pixels[200 * 200];
    memset(pixels, 0, sizeof(pixels));

    int ok = quadro_svg_render(doc, pixels, 200, 200, 1.0f);
    assert(ok == 1);

    uint32_t pix = pixels[100 * 200 + 100];
    uint8_t pa = (pix >> 24) & 0xFF;
    assert(pa > 0);

    printf("✔ Procedural texture sampling & data-fill-tex verified!\n");
    quadro_svg_doc_free(doc);
}

static void test_svg_shadows_and_blurs(void) {
    printf("--- 5. Testing Drop Shadows & Gaussian Box Blur ---\n");
    const char *xml =
        "<svg width=\"200\" height=\"200\">\n"
        "  <rect x=\"50\" y=\"50\" width=\"80\" height=\"80\" fill=\"#fabd2f\"\n"
        "        data-shadow='color:#000000,blur:8,dx:10,dy:10,opacity:0.7' />\n"
        "</svg>";

    quadro_svg_doc_t *doc = quadro_svg_parse_string(xml, strlen(xml));
    assert(doc != NULL);
    assert(doc->root != NULL);
    assert(doc->root->style.shadow.enabled == 1);
    assert(doc->root->style.shadow.blur == 8.0f);

    uint32_t pixels[200 * 200];
    memset(pixels, 0, sizeof(pixels));

    int ok = quadro_svg_render(doc, pixels, 200, 200, 1.0f);
    assert(ok == 1);

    /* Shadow offset pixel at (135, 135) outside shape should have non-zero alpha from blurred shadow */
    uint32_t shadow_pix = pixels[135 * 200 + 135];
    uint8_t sa = (shadow_pix >> 24) & 0xFF;
    assert(sa > 0);

    printf("✔ Drop shadow with Gaussian box blur verified!\n");
    quadro_svg_doc_free(doc);
}

static void test_svg_animation_and_sequence(void) {
    printf("--- 6. Testing DopeSheet Animation Timeline & Frame Evaluation ---\n");
    const char *xml =
        "<svg width=\"300\" height=\"200\">\n"
        "  <rect id=\"movingBox\" x=\"0\" y=\"50\" width=\"50\" height=\"50\" fill=\"#fe8019\" opacity=\"1.0\" />\n"
        "</svg>";

    quadro_svg_doc_t *doc = quadro_svg_parse_string(xml, strlen(xml));
    assert(doc != NULL);

    /* Create mock animation tracks */
    doc->animation = (quadro_svg_animation_t*)malloc(sizeof(quadro_svg_animation_t));
    memset(doc->animation, 0, sizeof(quadro_svg_animation_t));
    doc->animation->duration_ms = 1000.0f;
    doc->animation->fps = 30.0f;

    quadro_svg_anim_track_t *tr = (quadro_svg_anim_track_t*)malloc(sizeof(quadro_svg_anim_track_t));
    memset(tr, 0, sizeof(quadro_svg_anim_track_t));
    strncpy(tr->target_id, "movingBox", sizeof(tr->target_id));
    strncpy(tr->property, "transform", sizeof(tr->property));
    tr->keyframe_count = 2;
    tr->keyframes = (quadro_svg_keyframe_t*)malloc(2 * sizeof(quadro_svg_keyframe_t));
    memset(tr->keyframes, 0, 2 * sizeof(quadro_svg_keyframe_t));

    tr->keyframes[0].time_ms = 0.0f;
    tr->keyframes[0].x = 10.0f;
    tr->keyframes[0].scale_x = 1.0f;
    tr->keyframes[0].scale_y = 1.0f;

    tr->keyframes[1].time_ms = 1000.0f;
    tr->keyframes[1].x = 200.0f;
    tr->keyframes[1].scale_x = 1.0f;
    tr->keyframes[1].scale_y = 1.0f;

    doc->animation->tracks = tr;

    /* Evaluate at t = 500ms (midpoint: x should be ~105) */
    quadro_svg_doc_evaluate_time(doc, 500.0f);
    assert(fabsf(doc->root->transform.e - 105.0f) < 1.0f);

    /* Render animated frame */
    uint32_t pixels[300 * 200];
    memset(pixels, 0, sizeof(pixels));
    int ok = quadro_svg_render_frame(doc, pixels, 300, 200, 1.0f, 500.0f);
    assert(ok == 1);

    /* Pixel at (110, 75) should be hit */
    uint32_t hit = pixels[75 * 300 + 110];
    uint8_t ha = (hit >> 24) & 0xFF;
    assert(ha > 200);

    printf("✔ DopeSheet keyframe interpolation and frame rendering passed!\n");
    quadro_svg_doc_free(doc);
}

static void test_svg_file_export(void) {
    printf("--- 7. Testing Real SVG File Rendering & PNG Export ---\n");
    const char *out_png = "/tmp/test_icon_native.png";
    int ok = quadro_svg_render_to_file("icon.svg", out_png, 1.0f, 512, 512);
    assert(ok == 1);

    FILE *f = fopen(out_png, "rb");
    assert(f != NULL);
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fclose(f);
    assert(sz > 1000);

    printf("✔ Exported icon.svg to %s (%ld bytes) successfully!\n", out_png, sz);
}

static void test_svg_mypaint_brushes(void) {
    printf("--- 8. Testing libmypaint Vector Strokes & Masked Brush Fills ---\n");
    const char *xml =
        "<svg width=\"300\" height=\"300\" viewBox=\"0 0 300 300\">\n"
        "  <rect width=\"300\" height=\"300\" fill=\"#ffffff\" />\n"
        "  <path d=\"M 30 150 Q 150 30 270 150\" stroke=\"#1d4ed8\" stroke-width=\"12\" fill=\"none\"\n"
        "        data-brush=\"deevad/brush.myb\" data-brush-pressure=\"0.8\" />\n"
        "  <circle cx=\"150\" cy=\"200\" r=\"60\" fill=\"#dc2626\" stroke=\"#991b1b\" stroke-width=\"4\"\n"
        "          data-fill-brush=\"tanda/watercolor-02-paint.myb\" data-fill-pattern=\"wash\" data-fill-brush-size=\"18\" />\n"
        "</svg>";

    quadro_svg_doc_t *doc = quadro_svg_parse_string(xml, strlen(xml));
    assert(doc != NULL);

    uint32_t pixels[300 * 300];
    memset(pixels, 0, sizeof(pixels));

    int ok = quadro_svg_render(doc, pixels, 300, 300, 1.0f);
    assert(ok == 1);

    /* Verify stroke rendered */
    int blue_hits = 0;
    for (int y = 50; y < 150; y++) {
        for (int x = 50; x < 250; x++) {
            uint32_t pix = pixels[y * 300 + x];
            uint8_t a = (pix >> 24) & 0xFF;
            uint8_t b = (pix >> 16) & 0xFF;
            if (a > 50 && b > 100) blue_hits++;
        }
    }
    assert(blue_hits > 50);

    /* Verify masked brush fill rendered inside circle */
    int red_hits = 0;
    for (int y = 160; y < 240; y++) {
        for (int x = 110; x < 190; x++) {
            uint32_t pix = pixels[y * 300 + x];
            uint8_t a = (pix >> 24) & 0xFF;
            uint8_t r = pix & 0xFF;
            if (a > 50 && r > 100) red_hits++;
        }
    }
    assert(red_hits > 100);

    quadro_svg_doc_free(doc);

    /* Test file export for sample SVGs */
    const char *out_stroke = "/tmp/test_mypaint_stroke.png";
    const char *out_fill = "/tmp/test_mypaint_fill.png";
    ok = quadro_svg_render_to_file("tests/samples/mypaint_stroke_test.svg", out_stroke, 1.0f, 400, 400);
    assert(ok == 1);
    ok = quadro_svg_render_to_file("tests/samples/mypaint_fill_test.svg", out_fill, 1.0f, 500, 400);
    assert(ok == 1);

    printf("✔ libmypaint vector stroke & masked brush fill verified!\n");
}

int main(void) {
    printf("==================================================\n");
    printf("  Wesenho Quadro Native C SVG Runtime Test Suite  \n");
    printf("==================================================\n");

    test_svg_parser_and_shapes();
    test_svg_render_memory();
    test_svg_gradients();
    test_svg_procedural_textures();
    test_svg_shadows_and_blurs();
    test_svg_animation_and_sequence();
    test_svg_file_export();
    test_svg_mypaint_brushes();

    printf("\n>>> ALL NATIVE C SVG TESTS PASSED! <<<\n");
    return 0;
}
