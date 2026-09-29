CLANG ?= clang
CFLAGS = --target=wasm32 -nostdlib -fno-builtin -fno-delete-null-pointer-checks -O3 -msimd128 -mbulk-memory -mnontrapping-fptoint -msign-ext -flto -w -Iinclude
LDFLAGS = -Wl,--no-entry -Wl,--export-all -Wl,--allow-undefined -Wl,--stack-first -Wl,-z,stack-size=65536 -Wl,--initial-memory=67108864 -Wl,--max-memory=2147483648 -Wl,--lto-O3

CORE_WASM = plugins/canvas.wasm
MYPAINT_WASM = plugins/mypaint.wasm
LIBMYPAINT_WASM = plugins/libmypaint.wasm
PLUGIN_SRCS = $(wildcard src/plugins/*.c)
PLUGINS = $(patsubst src/plugins/%.c,plugins/%.wasm,$(PLUGIN_SRCS))

EMCC ?= emcc

all: $(CORE_WASM) $(MYPAINT_WASM) $(LIBMYPAINT_WASM) $(PLUGINS) plugins/manifest.json bin/quadro-svg

plugins/canvas.wasm: src/quadro.c include/quadro.h
	mkdir -p plugins
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $<

plugins/mypaint.wasm: src/mypaint/mypaint_engine.c src/mypaint/mypaint_engine.h
	mkdir -p plugins
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $<

plugins/libmypaint.wasm plugins/libmypaint.js: src/mypaint/wesenho_mypaint_surface.c src/mypaint/json_c_shim.c $(wildcard lib/libmypaint/*.c) $(wildcard lib/libmypaint/*.h)
	mkdir -p plugins
	$(EMCC) -O3 \
	  -Ilib/libmypaint -Ilib/libmypaint/glib -I/usr/include/json-c -Isrc/mypaint \
	  -D_GNU_SOURCE -D_POSIX_C_SOURCE=200809L -DJSON_C=1 -DJSON_C_MINOR_VERSION=15 \
	  src/mypaint/wesenho_mypaint_surface.c \
	  src/mypaint/json_c_shim.c \
	  lib/libmypaint/mypaint-brush.c \
	  lib/libmypaint/mypaint-brush-settings.c \
	  lib/libmypaint/mypaint-mapping.c \
	  lib/libmypaint/mypaint-surface.c \
	  lib/libmypaint/mypaint-rectangle.c \
	  lib/libmypaint/mypaint-matrix.c \
	  lib/libmypaint/mypaint-symmetry.c \
	  lib/libmypaint/helpers.c \
	  lib/libmypaint/fifo.c \
	  lib/libmypaint/rng-double.c \
	  lib/libmypaint/tilemap.c \
	  lib/libmypaint/operationqueue.c \
	  lib/libmypaint/mypaint-tiled-surface.c \
	  lib/libmypaint/mypaint-fixed-tiled-surface.c \
	  lib/libmypaint/brushmodes.c \
	  -s WASM=1 \
	  -s MODULARIZE=1 \
	  -s EXPORT_NAME="createLibMyPaint" \
	  -s ALLOW_MEMORY_GROWTH=1 \
	  -s EXPORTED_RUNTIME_METHODS='["HEAPU8","HEAP32","HEAP16","HEAPF32","ccall","cwrap","stringToUTF8","UTF8ToString","getValue","setValue"]' \
	  -s EXPORTED_FUNCTIONS='["_w_libmypaint_init","_w_libmypaint_alloc","_w_libmypaint_brush_new","_w_libmypaint_brush_free","_w_libmypaint_brush_reset","_w_libmypaint_brush_from_string","_w_libmypaint_brush_set_base_value","_w_libmypaint_brush_get_base_value","_w_libmypaint_brush_set_mapping_n","_w_libmypaint_brush_set_mapping_point","_w_libmypaint_stroke_to","_w_libmypaint_set_clip_mask","_w_libmypaint_clear_clip_mask","_w_libmypaint_get_dirty_rect","_w_libmypaint_clear_dirty_rect","_malloc","_free"]' \
	  -o plugins/libmypaint.js

plugins/%.wasm: src/plugins/%.c include/quadro.h
	mkdir -p plugins
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $<

plugins/manifest.json: $(PLUGINS)
	@mkdir -p plugins
	@node -e "const fs=require('fs'); const files=fs.readdirSync('plugins').filter(f=>f.endsWith('.wasm') && f !== 'canvas.wasm').sort(); fs.writeFileSync('plugins/manifest.json', JSON.stringify(files, null, 2));"

# =========================================================================
# Native C Standalone Targets (Zero Browser Dependency)
# =========================================================================
NATIVE_CC ?= gcc
LIBMYPAINT_SRCS = \
	src/mypaint/wesenho_mypaint_surface.c \
	src/mypaint/json_c_shim.c \
	lib/libmypaint/mypaint-brush.c \
	lib/libmypaint/mypaint-brush-settings.c \
	lib/libmypaint/mypaint-mapping.c \
	lib/libmypaint/mypaint-surface.c \
	lib/libmypaint/mypaint-rectangle.c \
	lib/libmypaint/mypaint-matrix.c \
	lib/libmypaint/mypaint-symmetry.c \
	lib/libmypaint/helpers.c \
	lib/libmypaint/fifo.c \
	lib/libmypaint/rng-double.c \
	lib/libmypaint/tilemap.c \
	lib/libmypaint/operationqueue.c \
	lib/libmypaint/mypaint-tiled-surface.c \
	lib/libmypaint/mypaint-fixed-tiled-surface.c \
	lib/libmypaint/brushmodes.c

NATIVE_CFLAGS ?= -O3 -Wall -Wextra -Wno-missing-field-initializers -Wno-unused-parameter -Wno-stringop-truncation \
	-Iinclude -Ilib/libmypaint -Ilib/libmypaint/glib -Isrc/mypaint -I/usr/include/json-c \
	-D_GNU_SOURCE -D_POSIX_C_SOURCE=200809L -DJSON_C=1 -DJSON_C_MINOR_VERSION=15

bin/quadro-svg: src/quadro_svg_cli.c src/svg/quadro_svg.c src/svg/quadro_font.c src/quadro.c $(LIBMYPAINT_SRCS) include/quadro.h include/quadro_svg.h include/stb_image_write.h
	mkdir -p bin
	$(NATIVE_CC) $(NATIVE_CFLAGS) -o $@ src/quadro_svg_cli.c src/svg/quadro_svg.c src/svg/quadro_font.c src/quadro.c $(LIBMYPAINT_SRCS) -lm

bin/test_native_svg: tests/test_native_svg.c src/svg/quadro_svg.c src/svg/quadro_font.c src/quadro.c $(LIBMYPAINT_SRCS) include/quadro.h include/quadro_svg.h include/stb_image_write.h
	mkdir -p bin
	$(NATIVE_CC) $(NATIVE_CFLAGS) -o $@ tests/test_native_svg.c src/svg/quadro_svg.c src/svg/quadro_font.c src/quadro.c $(LIBMYPAINT_SRCS) -lm

native: bin/quadro-svg bin/test_native_svg

test-native: bin/test_native_svg
	./bin/test_native_svg

clean:
	rm -rf plugins/*.wasm plugins/manifest.json roms bin

.PHONY: all run clean native test-native
