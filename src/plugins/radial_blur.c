/* Acumula 24 amostras girando ao redor do centro da camada. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Desfoque de rotação\",\"params\":[{\"name\":\"Ângulo\",\"min\":0,\"max\":45,\"default\":12,\"unit\":\"°\"},{\"name\":\"Mistura\",\"min\":0,\"max\":100,\"default\":100,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_spatial_apply(SF_RADIAL_BLUR, sf_clamp(p1, 0, 45), sf_clamp(p2, 0, 100));
}
