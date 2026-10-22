/* Gera veios turbulentos sobre uma base mineral clara e mistura com a imagem. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Veios de mármore\",\"params\":[{\"name\":\"Mistura\",\"min\":0,\"max\":100,\"default\":75,\"unit\":\"%\"},{\"name\":\"Escala dos veios\",\"min\":8,\"max\":140,\"default\":50,\"unit\":\"px\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_MARBLE, sf_clamp(p1, 0, 100), sf_clamp(p2, 8, 140));
}
