/* Ajusta principalmente cores com pouca saturação. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Vibração\",\"params\":[{\"name\":\"Vibração\",\"min\":-100,\"max\":100,\"default\":40,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_color_apply(SF_VIBRANCE, sf_clamp(p1, -100, 100), 0);
}
