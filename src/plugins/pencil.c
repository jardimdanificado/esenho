/* Compara a luminância local com sua média para simular grafite. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Desenho a lápis\",\"params\":[{\"name\":\"Raio\",\"min\":1,\"max\":16,\"default\":4,\"unit\":\"px\"},{\"name\":\"Traço\",\"min\":25,\"max\":300,\"default\":140,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_spatial_apply(SF_PENCIL, sf_clamp(p1, 1, 16), sf_clamp(p2, 25, 300));
}
