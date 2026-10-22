/* Ordena pixels por luminância em trechos horizontais; regiões escuras e transparentes separam os trechos. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Pixel sorting\",\"params\":[{\"name\":\"Comprimento dos trechos\",\"min\":4,\"max\":128,\"default\":48,\"unit\":\"px\"},{\"name\":\"Limiar de luminosidade\",\"min\":0,\"max\":250,\"default\":80,\"unit\":\"\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_PIXEL_SORT, sf_clamp(p1, 4, 128), sf_clamp(p2, 0, 250));
}
