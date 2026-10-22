/* Escurece as fronteiras de células irregulares para sugerir tinta ou verniz rachado. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Craquelado\",\"params\":[{\"name\":\"Tamanho das células\",\"min\":8,\"max\":120,\"default\":38,\"unit\":\"px\"},{\"name\":\"Profundidade das fissuras\",\"min\":0,\"max\":100,\"default\":65,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_CRACKLE, sf_clamp(p1, 8, 120), sf_clamp(p2, 0, 100));
}
