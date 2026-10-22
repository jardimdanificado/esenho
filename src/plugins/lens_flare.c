/* Localiza o pixel pintado mais luminoso e alinha cinco reflexos coloridos com o centro da camada. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Flare com fantasmas\",\"params\":[{\"name\":\"Intensidade\",\"min\":0,\"max\":150,\"default\":70,\"unit\":\"%\"},{\"name\":\"Raio dos fantasmas\",\"min\":1,\"max\":30,\"default\":10,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_LENS_FLARE, sf_clamp(p1, 0, 150), sf_clamp(p2, 1, 30));
}
