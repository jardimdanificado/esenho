/* Distribui gotas elípticas com refração local, bordas sombreadas e reflexos de luz. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Vidro com gotas\",\"params\":[{\"name\":\"Distância entre gotas\",\"min\":12,\"max\":120,\"default\":42,\"unit\":\"px\"},{\"name\":\"Refração\",\"min\":0,\"max\":100,\"default\":40,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_RAIN_GLASS, sf_clamp(p1, 12, 120), sf_clamp(p2, 0, 100));
}
