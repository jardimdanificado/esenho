/* Levanta pretos e suaviza brancos para reduzir contraste. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Desbotar\",\"params\":[{\"name\":\"Intensidade\",\"min\":0,\"max\":100,\"default\":35,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_color_apply(SF_FADE, sf_clamp(p1, 0, 100), 0);
}
