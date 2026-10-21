/* Substitui a cor pela média da faixa tonal dominante na vizinhança. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Pintura a óleo\",\"params\":[{\"name\":\"Raio\",\"min\":1,\"max\":4,\"default\":3,\"unit\":\"px\"},{\"name\":\"Faixas tonais\",\"min\":2,\"max\":8,\"default\":6,\"unit\":\"\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_spatial_apply(SF_OIL_PAINT, sf_clamp(p1, 1, 4), sf_clamp(p2, 2, 8));
}
