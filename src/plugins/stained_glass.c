/* Recompõe as cores em peças irregulares de vidro separadas por juntas escuras. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Vitral de vidro\",\"params\":[{\"name\":\"Tamanho das peças\",\"min\":8,\"max\":100,\"default\":30,\"unit\":\"px\"},{\"name\":\"Largura do chumbo\",\"min\":1,\"max\":8,\"default\":2,\"unit\":\"px\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_STAINED_GLASS, sf_clamp(p1, 8, 100), sf_clamp(p2, 1, 8));
}
