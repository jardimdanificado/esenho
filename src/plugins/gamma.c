/* Ajusta os meios tons preservando preto e branco; 100 é neutro. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Gama\",\"params\":[{\"name\":\"Gama\",\"min\":20,\"max\":300,\"default\":130,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_color_apply(SF_GAMMA, sf_clamp(p1, 20, 300), 0);
}
