/* Combina contraste forte e perda de saturação. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Bleach bypass\",\"params\":[{\"name\":\"Contraste\",\"min\":0,\"max\":100,\"default\":50,\"unit\":\"%\"},{\"name\":\"Dessaturação\",\"min\":0,\"max\":100,\"default\":65,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_color_apply(SF_BLEACH_BYPASS, sf_clamp(p1, 0, 100), sf_clamp(p2, 0, 100));
}
