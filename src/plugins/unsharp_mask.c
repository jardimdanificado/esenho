/* Realça a diferença entre a imagem e uma média de 25 amostras. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Máscara de nitidez\",\"params\":[{\"name\":\"Raio\",\"min\":1,\"max\":16,\"default\":3,\"unit\":\"px\"},{\"name\":\"Intensidade\",\"min\":0,\"max\":300,\"default\":120,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_spatial_apply(SF_UNSHARP_MASK, sf_clamp(p1, 1, 16), sf_clamp(p2, 0, 300));
}
