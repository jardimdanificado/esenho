/* Desloca a imagem entre tons frios e quentes. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Temperatura\",\"params\":[{\"name\":\"Calor\",\"min\":-100,\"max\":100,\"default\":25,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_color_apply(SF_TEMPERATURE, sf_clamp(p1, -100, 100), 0);
}
