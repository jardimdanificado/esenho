/* Simula fios alternados com luz e sombra sobre as cores da imagem. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Trama de tecido\",\"params\":[{\"name\":\"Tamanho\",\"min\":2,\"max\":32,\"default\":6,\"unit\":\"px\"},{\"name\":\"Relevo\",\"min\":0,\"max\":80,\"default\":25,\"unit\":\"\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_color_apply(SF_WEAVE, sf_clamp(p1, 2, 32), sf_clamp(p2, 0, 80));
}
