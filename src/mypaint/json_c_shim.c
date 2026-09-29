#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <ctype.h>
#include "json.h"

/* Minimal freestanding JSON-C shim for libmypaint brush serialization */

typedef enum {
    SHIM_JSON_NULL = 0,
    SHIM_JSON_BOOLEAN,
    SHIM_JSON_DOUBLE,
    SHIM_JSON_INT,
    SHIM_JSON_OBJECT,
    SHIM_JSON_ARRAY,
    SHIM_JSON_STRING
} ShimJsonType;

typedef struct ShimPair {
    void *k;
    int k_is_constant;
    const void *v;
    struct ShimPair *next;
    struct ShimPair *prev;
} ShimPair;

typedef struct ShimTable {
    int size;
    int count;
    ShimPair *head;
    ShimPair *tail;
} ShimTable;

struct json_object {
    ShimJsonType type;
    int ref_count;
    int int_val;
    double double_val;
    char *str_val;
    ShimTable obj;
    struct {
        struct json_object **items;
        int count;
        int cap;
    } arr;
};

struct json_object *json_object_new_object(void) {
    struct json_object *o = (struct json_object*)calloc(1, sizeof(struct json_object));
    if (o) {
        o->type = SHIM_JSON_OBJECT;
        o->ref_count = 1;
    }
    return o;
}

static struct json_object *new_val(ShimJsonType t) {
    struct json_object *o = (struct json_object*)calloc(1, sizeof(struct json_object));
    if (o) {
        o->type = t;
        o->ref_count = 1;
    }
    return o;
}

int json_object_put(struct json_object *obj) {
    if (!obj) return 0;
    obj->ref_count--;
    if (obj->ref_count <= 0) {
        if (obj->type == SHIM_JSON_STRING && obj->str_val) {
            free(obj->str_val);
        } else if (obj->type == SHIM_JSON_OBJECT) {
            ShimPair *cur = obj->obj.head;
            while (cur) {
                ShimPair *next = cur->next;
                if (cur->k) free(cur->k);
                if (cur->v) json_object_put((struct json_object*)cur->v);
                free(cur);
                cur = next;
            }
        } else if (obj->type == SHIM_JSON_ARRAY) {
            for (int i = 0; i < obj->arr.count; ++i) {
                if (obj->arr.items[i]) json_object_put(obj->arr.items[i]);
            }
            if (obj->arr.items) free(obj->arr.items);
        }
        free(obj);
        return 1;
    }
    return 0;
}

int json_object_is_type(const struct json_object *obj, enum json_type type) {
    if (!obj) return (type == json_type_null);
    switch (type) {
        case json_type_null: return obj->type == SHIM_JSON_NULL;
        case json_type_boolean: return obj->type == SHIM_JSON_BOOLEAN;
        case json_type_double: return obj->type == SHIM_JSON_DOUBLE || obj->type == SHIM_JSON_INT;
        case json_type_int: return obj->type == SHIM_JSON_INT || obj->type == SHIM_JSON_DOUBLE;
        case json_type_object: return obj->type == SHIM_JSON_OBJECT;
        case json_type_array: return obj->type == SHIM_JSON_ARRAY;
        case json_type_string: return obj->type == SHIM_JSON_STRING;
        default: return 0;
    }
}

json_bool json_object_object_get_ex(const struct json_object *obj, const char *key, struct json_object **value) {
    if (!obj || obj->type != SHIM_JSON_OBJECT || !key) return 0;
    ShimPair *cur = obj->obj.head;
    while (cur) {
        if (cur->k && strcmp((const char*)cur->k, key) == 0) {
            if (value) *value = (struct json_object*)cur->v;
            return 1;
        }
        cur = cur->next;
    }
    return 0;
}

struct json_object *json_object_object_get(const struct json_object *obj, const char *key) {
    struct json_object *val = NULL;
    if (json_object_object_get_ex(obj, key, &val)) {
        return val;
    }
    return NULL;
}

struct lh_table *json_object_get_object(const struct json_object *obj) {
    if (!obj || obj->type != SHIM_JSON_OBJECT) return NULL;
    return (struct lh_table*)&obj->obj;
}

int32_t json_object_get_int(const struct json_object *obj) {
    if (!obj) return 0;
    if (obj->type == SHIM_JSON_INT) return obj->int_val;
    if (obj->type == SHIM_JSON_DOUBLE) return (int32_t)obj->double_val;
    return 0;
}

double json_object_get_double(const struct json_object *obj) {
    if (!obj) return 0.0;
    if (obj->type == SHIM_JSON_DOUBLE) return obj->double_val;
    if (obj->type == SHIM_JSON_INT) return (double)obj->int_val;
    return 0.0;
}

size_t json_object_array_length(const struct json_object *obj) {
    if (!obj || obj->type != SHIM_JSON_ARRAY) return 0;
    return (size_t)obj->arr.count;
}

struct json_object *json_object_array_get_idx(const struct json_object *obj, size_t idx) {
    if (!obj || obj->type != SHIM_JSON_ARRAY || (int)idx >= obj->arr.count) return NULL;
    return obj->arr.items[idx];
}

/* Recursive Descent Parser */
static const char *skip_ws(const char *s) {
    while (*s && (*s == ' ' || *s == '\t' || *s == '\n' || *s == '\r')) s++;
    return s;
}

static struct json_object *parse_value(const char **ps);

static struct json_object *parse_object(const char **ps) {
    const char *s = *ps;
    if (*s != '{') return NULL;
    s++;
    struct json_object *obj = new_val(SHIM_JSON_OBJECT);

    while (1) {
        s = skip_ws(s);
        if (*s == '}') { s++; break; }
        if (*s == '\0') break;

        /* Parse key string */
        if (*s != '"') break;
        s++;
        const char *kstart = s;
        while (*s && *s != '"') s++;
        int klen = s - kstart;
        char *key = (char*)malloc(klen + 1);
        memcpy(key, kstart, klen);
        key[klen] = '\0';
        if (*s == '"') s++;

        s = skip_ws(s);
        if (*s == ':') s++;
        *ps = s;

        struct json_object *val = parse_value(ps);
        s = *ps;
        if (val) {
            ShimPair *p = (ShimPair*)calloc(1, sizeof(ShimPair));
            p->k = key;
            p->v = val;
            if (!obj->obj.head) {
                obj->obj.head = p;
                obj->obj.tail = p;
            } else {
                obj->obj.tail->next = p;
                p->prev = obj->obj.tail;
                obj->obj.tail = p;
            }
            obj->obj.count++;
        } else {
            free(key);
        }

        s = skip_ws(s);
        if (*s == ',') { s++; continue; }
        if (*s == '}') { s++; break; }
    }

    *ps = s;
    return obj;
}

static struct json_object *parse_array(const char **ps) {
    const char *s = *ps;
    if (*s != '[') return NULL;
    s++;
    struct json_object *arr = new_val(SHIM_JSON_ARRAY);
    arr->arr.cap = 8;
    arr->arr.items = (struct json_object**)malloc(arr->arr.cap * sizeof(struct json_object*));

    while (1) {
        s = skip_ws(s);
        if (*s == ']') { s++; break; }
        if (*s == '\0') break;

        *ps = s;
        struct json_object *val = parse_value(ps);
        s = *ps;
        if (!val) break;

        if (arr->arr.count >= arr->arr.cap) {
            arr->arr.cap *= 2;
            arr->arr.items = (struct json_object**)realloc(arr->arr.items, arr->arr.cap * sizeof(struct json_object*));
        }
        arr->arr.items[arr->arr.count++] = val;

        s = skip_ws(s);
        if (*s == ',') { s++; continue; }
        if (*s == ']') { s++; break; }
    }

    *ps = s;
    return arr;
}

static struct json_object *parse_value(const char **ps) {
    const char *s = skip_ws(*ps);
    if (!*s) return NULL;
    *ps = s;

    if (*s == '{') return parse_object(ps);
    if (*s == '[') return parse_array(ps);

    if (*s == '"') {
        s++;
        const char *start = s;
        while (*s && *s != '"') s++;
        int len = s - start;
        char *str = (char*)malloc(len + 1);
        memcpy(str, start, len);
        str[len] = '\0';
        if (*s == '"') s++;
        *ps = s;
        struct json_object *o = new_val(SHIM_JSON_STRING);
        o->str_val = str;
        return o;
    }

    if (*s == 't' || *s == 'f') {
        int b = (*s == 't');
        while (*s && isalpha(*s)) s++;
        *ps = s;
        struct json_object *o = new_val(SHIM_JSON_BOOLEAN);
        o->int_val = b;
        return o;
    }

    if (*s == '-' || isdigit(*s)) {
        char *end = NULL;
        double d = strtod(s, &end);
        int is_float = 0;
        for (const char *p = s; p < end; p++) {
            if (*p == '.' || *p == 'e' || *p == 'E') { is_float = 1; break; }
        }
        *ps = end;
        if (is_float) {
            struct json_object *o = new_val(SHIM_JSON_DOUBLE);
            o->double_val = d;
            o->int_val = (int)d;
            return o;
        } else {
            struct json_object *o = new_val(SHIM_JSON_INT);
            o->int_val = (int)d;
            o->double_val = d;
            return o;
        }
    }

    return NULL;
}

struct json_object *json_tokener_parse(const char *str) {
    if (!str) return NULL;
    const char *s = str;
    return parse_value(&s);
}
