CLANG ?= clang
CFLAGS = --target=wasm32 -nostdlib -fno-builtin -fno-delete-null-pointer-checks -O3 -msimd128 -flto -w -Iinclude
LDFLAGS = -Wl,--no-entry -Wl,--export-all -Wl,--allow-undefined -Wl,--stack-first -Wl,-z,stack-size=65536 -Wl,--initial-memory=67108864 -Wl,--max-memory=2147483648 -Wl,--lto-O3

CORE_WASM = plugins/canvas.wasm
PLUGIN_SRCS = $(wildcard src/plugins/*.c)
PLUGINS = $(patsubst src/plugins/%.c,plugins/%.wasm,$(PLUGIN_SRCS))

all: $(CORE_WASM) $(PLUGINS) plugins/manifest.json

plugins/canvas.wasm: src/quadro.c include/quadro.h
	mkdir -p plugins
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $<

plugins/%.wasm: src/plugins/%.c include/quadro.h
	mkdir -p plugins
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $<

plugins/manifest.json: $(PLUGINS)
	@mkdir -p plugins
	@node -e "const fs=require('fs'); const files=fs.readdirSync('plugins').filter(f=>f.endsWith('.wasm') && f !== 'canvas.wasm').sort(); fs.writeFileSync('plugins/manifest.json', JSON.stringify(files, null, 2));"

clean:
	rm -rf plugins/*.wasm plugins/manifest.json roms

.PHONY: all run clean
