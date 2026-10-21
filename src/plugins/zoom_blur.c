/* Acumula 24 amostras em direção ao centro da camada. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Desfoque de zoom\",\"params\":[{\"name\":\"Distância\",\"min\":0,\"max\":80,\"default\":20,\"unit\":\"%\"},{\"name\":\"Mistura\",\"min\":0,\"max\":100,\"default\":100,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_spatial_apply(SF_ZOOM_BLUR, sf_clamp(p1, 0, 80), sf_clamp(p2, 0, 100));
}
