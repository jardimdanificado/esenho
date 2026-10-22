/* Remonta a imagem em faixas horizontais deslocadas, sugerindo captura temporal por fenda. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Slit-scan em faixas\",\"params\":[{\"name\":\"Deslocamento\",\"min\":0,\"max\":140,\"default\":40,\"unit\":\"px\"},{\"name\":\"Altura das faixas\",\"min\":1,\"max\":32,\"default\":4,\"unit\":\"px\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_SLIT_SCAN, sf_clamp(p1, 0, 140), sf_clamp(p2, 1, 32));
}
