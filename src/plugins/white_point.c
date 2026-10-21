/* Remapeia a entrada escolhida para branco. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Ponto branco\",\"params\":[{\"name\":\"Ponto branco\",\"min\":55,\"max\":255,\"default\":225,\"unit\":\"\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_color_apply(SF_WHITE_POINT, sf_clamp(p1, 55, 255), 0);
}
