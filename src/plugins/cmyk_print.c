/* Separa ciano, magenta, amarelo e preto em retículas de ângulos diferentes. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Impressão CMYK\",\"params\":[{\"name\":\"Retícula\",\"min\":2,\"max\":20,\"default\":7,\"unit\":\"px\"},{\"name\":\"Desregistro\",\"min\":0,\"max\":12,\"default\":1,\"unit\":\"px\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_CMYK_PRINT, sf_clamp(p1, 2, 20), sf_clamp(p2, 0, 12));
}
