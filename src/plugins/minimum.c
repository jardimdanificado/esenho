/* Expande regiões escuras pelo mínimo local de cada canal. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Mínimo (escurecer)\",\"params\":[{\"name\":\"Raio\",\"min\":1,\"max\":5,\"default\":2,\"unit\":\"px\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_spatial_apply(SF_MINIMUM, sf_clamp(p1, 1, 5), 0);
}
