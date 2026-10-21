/* Transforma o tom em linhas onduladas de espessura variável. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Gravura\",\"params\":[{\"name\":\"Espaçamento\",\"min\":2,\"max\":24,\"default\":6,\"unit\":\"px\"},{\"name\":\"Mistura\",\"min\":0,\"max\":100,\"default\":100,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_color_apply(SF_ENGRAVING, sf_clamp(p1, 2, 24), sf_clamp(p2, 0, 100));
}
