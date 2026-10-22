/* Véu quente e irregular entrando por uma borda, como uma câmera com vedação danificada. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Vazamento de luz\",\"params\":[{\"name\":\"Intensidade\",\"min\":0,\"max\":100,\"default\":65,\"unit\":\"%\"},{\"name\":\"Borda: 0=esq, 1=dir, 2=cima, 3=baixo\",\"min\":0,\"max\":3,\"default\":0,\"unit\":\"\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_LIGHT_LEAK, sf_clamp(p1, 0, 100), sf_clamp(p2, 0, 3));
}
