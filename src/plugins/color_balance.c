/* Ajusta o balanço dos canais vermelho e azul. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Balanço de cores\",\"params\":[{\"name\":\"Vermelho / ciano\",\"min\":-100,\"max\":100,\"default\":20,\"unit\":\"\"},{\"name\":\"Azul / amarelo\",\"min\":-100,\"max\":100,\"default\":-15,\"unit\":\"\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_color_apply(SF_COLOR_BALANCE, sf_clamp(p1, -100, 100), sf_clamp(p2, -100, 100));
}
