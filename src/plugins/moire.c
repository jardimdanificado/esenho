/* Sobrepõe duas grades próximas para produzir grandes bandas de interferência colorida. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Interferência moiré\",\"params\":[{\"name\":\"Período das grades\",\"min\":2,\"max\":40,\"default\":8,\"unit\":\"px\"},{\"name\":\"Ângulo entre grades\",\"min\":1,\"max\":89,\"default\":8,\"unit\":\"°\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_MOIRE, sf_clamp(p1, 2, 40), sf_clamp(p2, 1, 89));
}
