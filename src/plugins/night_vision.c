/* Converte a luminosidade em verde, com ganho, ruído e escurecimento periférico. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Visão noturna\",\"params\":[{\"name\":\"Ganho\",\"min\":50,\"max\":500,\"default\":220,\"unit\":\"%\"},{\"name\":\"Ruído\",\"min\":0,\"max\":100,\"default\":25,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_NIGHT_VISION, sf_clamp(p1, 50, 500), sf_clamp(p2, 0, 100));
}
