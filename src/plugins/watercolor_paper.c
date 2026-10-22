/* Fibras direcionais, relevo fino do papel e pigmento acumulado nas transições de tom. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Papel aquarela\",\"params\":[{\"name\":\"Textura\",\"min\":0,\"max\":100,\"default\":55,\"unit\":\"%\"},{\"name\":\"Escala das fibras\",\"min\":2,\"max\":30,\"default\":8,\"unit\":\"px\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_WATERCOLOR_PAPER, sf_clamp(p1, 0, 100), sf_clamp(p2, 2, 30));
}
