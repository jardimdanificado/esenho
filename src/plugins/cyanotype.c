/* Mapeia os tons entre azul profundo e papel claro, com granulação fina. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Cianotipia\",\"params\":[{\"name\":\"Contraste\",\"min\":0,\"max\":150,\"default\":40,\"unit\":\"%\"},{\"name\":\"Textura do papel\",\"min\":0,\"max\":60,\"default\":15,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_CYANOTYPE, sf_clamp(p1, 0, 150), sf_clamp(p2, 0, 60));
}
