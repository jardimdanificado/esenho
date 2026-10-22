/* Converte os tons para metal frio com fibras alongadas e faixas de brilho. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Metal escovado\",\"params\":[{\"name\":\"Escovação\",\"min\":0,\"max\":100,\"default\":70,\"unit\":\"%\"},{\"name\":\"Direção\",\"min\":0,\"max\":179,\"default\":0,\"unit\":\"°\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_BRUSHED_METAL, sf_clamp(p1, 0, 100), sf_clamp(p2, 0, 179));
}
