/* Desfoca em uma direção com até 32 amostras. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Desfoque de movimento\",\"params\":[{\"name\":\"Distância\",\"min\":0,\"max\":100,\"default\":20,\"unit\":\"px\"},{\"name\":\"Ângulo\",\"min\":0,\"max\":359,\"default\":0,\"unit\":\"°\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_spatial_apply(SF_MOTION_BLUR, sf_clamp(p1, 0, 100), sf_clamp(p2, 0, 359));
}
