/* Interpreta a luminância como altura da tinta e aplica iluminação direcional ao relevo. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Luz sobre impasto\",\"params\":[{\"name\":\"Relevo\",\"min\":0,\"max\":200,\"default\":100,\"unit\":\"%\"},{\"name\":\"Direção da luz\",\"min\":0,\"max\":359,\"default\":315,\"unit\":\"°\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_IMPASTO_LIGHTING, sf_clamp(p1, 0, 200), sf_clamp(p2, 0, 359));
}
