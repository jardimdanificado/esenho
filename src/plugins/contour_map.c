/* Interpreta a luminosidade como altitude, com cores de terreno e curvas de nível. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Mapa de altitude\",\"params\":[{\"name\":\"Faixas de altitude\",\"min\":3,\"max\":32,\"default\":12,\"unit\":\"\"},{\"name\":\"Largura tonal das curvas\",\"min\":1,\"max\":100,\"default\":35,\"unit\":\"\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_CONTOUR_MAP, sf_clamp(p1, 3, 32), sf_clamp(p2, 1, 100));
}
