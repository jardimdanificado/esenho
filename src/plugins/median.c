/* Reduz ruído impulsivo com a mediana de uma janela de 3×3 ou 5×5. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Mediana\",\"params\":[{\"name\":\"Raio\",\"min\":1,\"max\":2,\"default\":1,\"unit\":\"px\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_spatial_apply(SF_MEDIAN, sf_clamp(p1, 1, 2), 0);
}
