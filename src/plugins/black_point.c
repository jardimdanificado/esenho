/* Remapeia a entrada escolhida para preto. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Ponto preto\",\"params\":[{\"name\":\"Ponto preto\",\"min\":0,\"max\":200,\"default\":25,\"unit\":\"\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_color_apply(SF_BLACK_POINT, sf_clamp(p1, 0, 200), 0);
}
