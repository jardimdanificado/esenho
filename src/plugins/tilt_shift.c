/* Mantém uma faixa horizontal central em foco e desfoca o restante. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Miniatura (tilt-shift)\",\"params\":[{\"name\":\"Raio\",\"min\":1,\"max\":24,\"default\":10,\"unit\":\"px\"},{\"name\":\"Faixa em foco\",\"min\":0,\"max\":90,\"default\":25,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_spatial_apply(SF_TILT_SHIFT, sf_clamp(p1, 1, 24), sf_clamp(p2, 0, 90));
}
