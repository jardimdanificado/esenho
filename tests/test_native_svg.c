#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include <string.h>
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

static void test_svg_file_export(void) {
    printf("--- 3. Testing Real SVG File Rendering & PNG Export ---\n");
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

int main(void) {
    printf("==================================================\n");
    printf("  Wesenho Quadro Native C SVG Runtime Test Suite  \n");
    printf("==================================================\n");

    test_svg_parser_and_shapes();
    test_svg_render_memory();
    test_svg_file_export();

    printf("\n>>> ALL NATIVE C SVG TESTS PASSED! <<<\n");
    return 0;
}
