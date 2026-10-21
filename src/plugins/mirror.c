/* Copia a metade escolhida para criar simetria horizontal, vertical ou dupla. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Espelho simétrico\",\"params\":[{\"name\":\"Eixo: 0=X, 1=Y, 2=XY\",\"min\":0,\"max\":2,\"default\":0,\"unit\":\"\"},{\"name\":\"Origem: 0=início, 1=fim\",\"min\":0,\"max\":1,\"default\":0,\"unit\":\"\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_spatial_apply(SF_MIRROR, sf_clamp(p1, 0, 2), sf_clamp(p2, 0, 1));
}
