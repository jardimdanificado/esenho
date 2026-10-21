/* Converte a luminância para uma tonalidade escolhida. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Colorizar\",\"params\":[{\"name\":\"Matiz\",\"min\":0,\"max\":359,\"default\":200,\"unit\":\"°\"},{\"name\":\"Saturação\",\"min\":0,\"max\":100,\"default\":65,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_color_apply(SF_COLORIZE, sf_clamp(p1, 0, 359), sf_clamp(p2, 0, 100));
}
