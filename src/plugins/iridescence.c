/* Usa luminância e direção das bordas para sugerir película fina, óleo ou superfície nacarada. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Filme iridescente\",\"params\":[{\"name\":\"Mistura\",\"min\":0,\"max\":100,\"default\":60,\"unit\":\"%\"},{\"name\":\"Deslocamento de cor\",\"min\":0,\"max\":359,\"default\":30,\"unit\":\"°\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_IRIDESCENCE, sf_clamp(p1, 0, 100), sf_clamp(p2, 0, 359));
}
