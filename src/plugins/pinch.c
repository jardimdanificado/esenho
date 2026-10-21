/* Distorce radialmente uma região elíptica central. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Pinçar / inflar\",\"params\":[{\"name\":\"Força\",\"min\":-100,\"max\":100,\"default\":60,\"unit\":\"%\"},{\"name\":\"Área\",\"min\":10,\"max\":100,\"default\":90,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_spatial_apply(SF_PINCH, sf_clamp(p1, -100, 100), sf_clamp(p2, 10, 100));
}
