/* Suaviza ruído com pesos espaciais e de cor para preservar bordas. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Suavização bilateral\",\"params\":[{\"name\":\"Raio\",\"min\":1,\"max\":4,\"default\":3,\"unit\":\"px\"},{\"name\":\"Tolerância de cor\",\"min\":1,\"max\":100,\"default\":25,\"unit\":\"\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_spatial_apply(SF_BILATERAL, sf_clamp(p1, 1, 4), sf_clamp(p2, 1, 100));
}
