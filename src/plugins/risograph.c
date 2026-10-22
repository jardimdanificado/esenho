/* Separa tintas azul e coral, com retículas inclinadas, falhas de tinta e desregistro. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Risografia de duas tintas\",\"params\":[{\"name\":\"Retícula\",\"min\":2,\"max\":18,\"default\":6,\"unit\":\"px\"},{\"name\":\"Desregistro\",\"min\":0,\"max\":16,\"default\":3,\"unit\":\"px\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_RISOGRAPH, sf_clamp(p1, 2, 18), sf_clamp(p2, 0, 16));
}
