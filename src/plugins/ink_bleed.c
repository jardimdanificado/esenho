/* Difunde principalmente as cores escuras, sugerindo absorção de tinta pelo papel. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Tinta que sangra\",\"params\":[{\"name\":\"Raio\",\"min\":1,\"max\":12,\"default\":4,\"unit\":\"px\"},{\"name\":\"Mistura\",\"min\":0,\"max\":100,\"default\":65,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_INK_BLEED, sf_clamp(p1, 1, 12), sf_clamp(p2, 0, 100));
}
