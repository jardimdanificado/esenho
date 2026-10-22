/* Atenua vermelho e adiciona luz cáustica procedural, sugerindo uma cena debaixo d’água. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Submerso\",\"params\":[{\"name\":\"Profundidade\",\"min\":0,\"max\":100,\"default\":70,\"unit\":\"%\"},{\"name\":\"Luz cáustica\",\"min\":0,\"max\":100,\"default\":45,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_UNDERWATER, sf_clamp(p1, 0, 100), sf_clamp(p2, 0, 100));
}
