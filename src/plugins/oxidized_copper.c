/* Mistura cobre escurecido e manchas de pátina verde-azulada, mantendo as variações tonais. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Cobre oxidado\",\"params\":[{\"name\":\"Pátina\",\"min\":0,\"max\":100,\"default\":65,\"unit\":\"%\"},{\"name\":\"Escala das manchas\",\"min\":8,\"max\":160,\"default\":45,\"unit\":\"px\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_OXIDIZED_COPPER, sf_clamp(p1, 0, 100), sf_clamp(p2, 8, 160));
}
