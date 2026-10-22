/* Grão determinístico mais perceptível nas sombras, com leve diferença entre os canais. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Grão de película\",\"params\":[{\"name\":\"Intensidade\",\"min\":0,\"max\":100,\"default\":24,\"unit\":\"%\"},{\"name\":\"Tamanho do grão\",\"min\":1,\"max\":6,\"default\":1,\"unit\":\"px\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_FILM_GRAIN, sf_clamp(p1, 0, 100), sf_clamp(p2, 1, 6));
}
