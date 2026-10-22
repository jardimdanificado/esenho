/* Cria raios horizontais, verticais e diagonais a partir das altas luzes. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Estrelas de difração\",\"params\":[{\"name\":\"Comprimento\",\"min\":4,\"max\":160,\"default\":48,\"unit\":\"px\"},{\"name\":\"Limiar de luz\",\"min\":80,\"max\":250,\"default\":185,\"unit\":\"\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_DIFFRACTION_STAR, sf_clamp(p1, 4, 160), sf_clamp(p2, 80, 250));
}
