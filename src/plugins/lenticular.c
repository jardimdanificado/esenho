/* Intercala tiras da imagem e de sua versão espelhada, lembrando uma lâmina lenticular. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Lente lenticular\",\"params\":[{\"name\":\"Largura das tiras\",\"min\":2,\"max\":40,\"default\":8,\"unit\":\"px\"},{\"name\":\"Deslocamento\",\"min\":0,\"max\":100,\"default\":18,\"unit\":\"px\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_LENTICULAR, sf_clamp(p1, 2, 40), sf_clamp(p2, 0, 100));
}
