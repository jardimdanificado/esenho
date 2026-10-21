/* Aplica curvas RGB diferentes para simular revelação cruzada. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Processo cruzado\",\"params\":[{\"name\":\"Intensidade\",\"min\":0,\"max\":100,\"default\":75,\"unit\":\"%\"},{\"name\":\"Calor\",\"min\":-50,\"max\":50,\"default\":10,\"unit\":\"\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_color_apply(SF_CROSS_PROCESS, sf_clamp(p1, 0, 100), sf_clamp(p2, -50, 50));
}
