/* Aplica corrosão irregular em tons de óxido de ferro, com porosidade fina. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Ferrugem\",\"params\":[{\"name\":\"Cobertura\",\"min\":0,\"max\":100,\"default\":65,\"unit\":\"%\"},{\"name\":\"Escala da corrosão\",\"min\":8,\"max\":160,\"default\":50,\"unit\":\"px\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_RUST, sf_clamp(p1, 0, 100), sf_clamp(p2, 8, 160));
}
