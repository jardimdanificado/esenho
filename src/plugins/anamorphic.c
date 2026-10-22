/* Espalha as altas luzes em faixas horizontais azuladas. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Flare anamórfico\",\"params\":[{\"name\":\"Comprimento\",\"min\":4,\"max\":240,\"default\":90,\"unit\":\"px\"},{\"name\":\"Limiar de luz\",\"min\":80,\"max\":250,\"default\":180,\"unit\":\"\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_ANAMORPHIC, sf_clamp(p1, 4, 240), sf_clamp(p2, 80, 250));
}
