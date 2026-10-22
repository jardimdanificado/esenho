/* Limiar adaptado à vizinhança e irregularidade do toner sobre papel levemente quente. */
#include "quadro_filter_creative.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Fotocópia de toner\",\"params\":[{\"name\":\"Limiar\",\"min\":20,\"max\":240,\"default\":145,\"unit\":\"\"},{\"name\":\"Falhas de toner\",\"min\":0,\"max\":100,\"default\":35,\"unit\":\"%\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    cf_apply(CF_PHOTOCOPY, sf_clamp(p1, 20, 240), sf_clamp(p2, 0, 100));
}
