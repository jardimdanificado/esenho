/* Difunde as altas luzes em um halo vermelho e âmbar, inspirado em película. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Halation de filme\",\"params\":[{\"name\":\"Raio\",\"min\":1,\"max\":48,\"default\":12,\"unit\":\"px\"},{\"name\":\"Intensidade\",\"min\":0,\"max\":200,\"default\":100,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_HALATION, sf_clamp(p1, 1, 48), sf_clamp(p2, 0, 200));
}
