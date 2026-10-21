/* Reduz o número de níveis em cada canal de cor. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Posterizar\",\"params\":[{\"name\":\"Níveis por canal\",\"min\":2,\"max\":32,\"default\":5,\"unit\":\"\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_color_apply(SF_POSTERIZE, sf_clamp(p1, 2, 32), 0);
}
