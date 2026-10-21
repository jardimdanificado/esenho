/* Aplica matizes diferentes nas sombras e nas luzes. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Tonalização dividida\",\"params\":[{\"name\":\"Matiz das sombras\",\"min\":0,\"max\":359,\"default\":220,\"unit\":\"°\"},{\"name\":\"Matiz das luzes\",\"min\":0,\"max\":359,\"default\":40,\"unit\":\"°\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_color_apply(SF_SPLIT_TONE, sf_clamp(p1, 0, 359), sf_clamp(p2, 0, 359));
}
