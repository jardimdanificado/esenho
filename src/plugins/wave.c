/* Desloca os dois eixos com ondas senoidais. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Ondas XY\",\"params\":[{\"name\":\"Amplitude\",\"min\":0,\"max\":80,\"default\":12,\"unit\":\"px\"},{\"name\":\"Comprimento\",\"min\":8,\"max\":300,\"default\":80,\"unit\":\"px\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_spatial_apply(SF_WAVE, sf_clamp(p1, 0, 80), sf_clamp(p2, 8, 300));
}
