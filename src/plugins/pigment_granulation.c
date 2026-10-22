/* Agrupa pigmento em manchas de várias escalas, com deposição diferente por canal. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Granulação de pigmento\",\"params\":[{\"name\":\"Intensidade\",\"min\":0,\"max\":150,\"default\":85,\"unit\":\"%\"},{\"name\":\"Escala\",\"min\":2,\"max\":40,\"default\":8,\"unit\":\"px\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_PIGMENT_GRANULATION, sf_clamp(p1, 0, 150), sf_clamp(p2, 2, 40));
}
