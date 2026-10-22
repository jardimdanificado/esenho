/* Sombras densas e granuladas com altas luzes quentes, inspiradas na impressão lith. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Revelação lith\",\"params\":[{\"name\":\"Grão nas sombras\",\"min\":0,\"max\":100,\"default\":35,\"unit\":\"%\"},{\"name\":\"Calor\",\"min\":0,\"max\":100,\"default\":55,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_LITH_PRINT, sf_clamp(p1, 0, 100), sf_clamp(p2, 0, 100));
}
