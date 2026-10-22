/* Desloca os canais em sentidos diferentes, com refração variável pela luminosidade local. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Refração prismática\",\"params\":[{\"name\":\"Dispersão\",\"min\":0,\"max\":60,\"default\":12,\"unit\":\"px\"},{\"name\":\"Direção\",\"min\":0,\"max\":359,\"default\":30,\"unit\":\"°\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_PRISM, sf_clamp(p1, 0, 60), sf_clamp(p2, 0, 359));
}
