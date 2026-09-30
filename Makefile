CLANG ?= clang
CFLAGS = --target=wasm32 -nostdlib -fno-builtin -fno-delete-null-pointer-checks -O3 -msimd128 -mbulk-memory -mnontrapping-fptoint -msign-ext -flto -w -Iinclude
LDFLAGS = -Wl,--no-entry -Wl,--export-all -Wl,--allow-undefined -Wl,--stack-first -Wl,-z,stack-size=65536 -Wl,--initial-memory=67108864 -Wl,--max-memory=2147483648 -Wl,--lto-O3

CORE_WASM = plugins/canvas.wasm
PLUGIN_SRCS = $(wildcard src/plugins/*.c)
PLUGINS = $(patsubst src/plugins/%.c,plugins/%.wasm,$(PLUGIN_SRCS))

all: $(CORE_WASM) $(PLUGINS) plugins/manifest.json bin/quadro-svg

plugins/canvas.wasm: src/quadro.c include/quadro.h
	mkdir -p plugins
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $<

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
NATIVE_CFLAGS ?= -O3 -Wall -Wextra -Wno-missing-field-initializers -Wno-unused-parameter -Iinclude -lm

bin/quadro-svg: src/quadro_svg_cli.c src/svg/quadro_svg.c src/svg/quadro_font.c src/quadro.c include/quadro.h include/quadro_svg.h include/stb_image_write.h
	mkdir -p bin
	$(NATIVE_CC) $(NATIVE_CFLAGS) -o $@ src/quadro_svg_cli.c src/svg/quadro_svg.c src/svg/quadro_font.c src/quadro.c -lm

bin/test_native_svg: tests/test_native_svg.c src/svg/quadro_svg.c src/svg/quadro_font.c src/quadro.c include/quadro.h include/quadro_svg.h include/stb_image_write.h
	mkdir -p bin
	$(NATIVE_CC) $(NATIVE_CFLAGS) -o $@ tests/test_native_svg.c src/svg/quadro_svg.c src/svg/quadro_font.c src/quadro.c -lm

bin/test_brush_dynamics: tests/test_brush_dynamics.c src/quadro_brush_dynamics.c include/quadro_brush_dynamics.h
	mkdir -p bin
	$(NATIVE_CC) $(NATIVE_CFLAGS) -o $@ tests/test_brush_dynamics.c src/quadro_brush_dynamics.c -lm

native: bin/quadro-svg bin/test_brush_dynamics

test-native: bin/test_brush_dynamics
	./bin/test_brush_dynamics

test-brush-dyn: bin/test_brush_dynamics
	./bin/test_brush_dynamics

clean:
	rm -rf plugins/*.wasm plugins/manifest.json roms bin

.PHONY: all run clean native test-native test-brush-dyn
