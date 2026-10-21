/* Mistura R→B, G→R e B→G, com mistura monocromática opcional. */
#include "quadro_filter_suite.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Misturar canais\",\"params\":[{\"name\":\"Rotação RGB\",\"min\":0,\"max\":100,\"default\":50,\"unit\":\"%\"},{\"name\":\"Monocromático\",\"min\":0,\"max\":100,\"default\":0,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    sf_color_apply(SF_CHANNEL_MIXER, sf_clamp(p1, 0, 100), sf_clamp(p2, 0, 100));
}
