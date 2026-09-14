CLANG ?= clang
CFLAGS = --target=wasm32 -nostdlib -fno-builtin -fno-delete-null-pointer-checks -O3 -w -Iinclude
LDFLAGS = -Wl,--no-entry -Wl,--export-all -Wl,--allow-undefined -Wl,--stack-first -Wl,-z,stack-size=65536 -Wl,--initial-memory=67108864 -Wl,--max-memory=2147483648

ROMS = roms/canvas.wasm
PLUGIN_SRCS = $(wildcard src/plugins/*.c)
PLUGINS = $(patsubst src/plugins/%.c,plugins/%.wasm,$(PLUGIN_SRCS))

all: $(ROMS) $(PLUGINS)

roms/canvas.wasm: src/canvas.c include/wesenho.h
	mkdir -p roms
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $<

plugins/%.wasm: src/plugins/%.c include/wesenho.h
	mkdir -p plugins
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $<

run: all
	node src/wesenho.js

clean:
	rm -rf roms/*.wasm plugins/*.wasm

.PHONY: all run clean
