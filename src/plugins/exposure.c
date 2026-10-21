/* Multiplica a luz em passos de exposição; 100 equivale a +1 EV. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Exposição\",\"params\":[{\"name\":\"Exposição\",\"min\":-300,\"max\":300,\"default\":50,\"unit\":\"EV × 100\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_color_apply(SF_EXPOSURE, sf_clamp(p1, -300, 300), 0);
}
