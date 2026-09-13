CLANG ?= clang
CFLAGS = --target=wasm32 -nostdlib -fno-builtin -fno-delete-null-pointer-checks -O3 -w -Iinclude
LDFLAGS = -Wl,--no-entry -Wl,--export-all -Wl,--allow-undefined -Wl,--stack-first -Wl,-z,stack-size=65536 -Wl,--initial-memory=67108864 -Wl,--max-memory=268435456

ROMS = roms/canvas.wasm roms/tools.wasm roms/palette.wasm roms/layers.wasm
PLUGINS = plugins/uis/console.wasm

all: $(ROMS) $(PLUGINS)

roms/canvas.wasm: actors/canvas/main.c include/wesenho.h
	mkdir -p roms
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $<

roms/tools.wasm: actors/tools/main.c include/wesenho.h include/font5x7.h
	mkdir -p roms
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $<

roms/palette.wasm: actors/palette/main.c include/wesenho.h include/font5x7.h
	mkdir -p roms
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $<

roms/layers.wasm: actors/layers/main.c include/wesenho.h include/font5x7.h
	mkdir -p roms
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $<

plugins/uis/color_picker.wasm: plugins/uis/color_picker/main.c include/wesenho.h include/font5x7.h
	mkdir -p plugins/uis
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $<

plugins/uis/brush_picker.wasm: plugins/uis/brush_picker/main.c include/wesenho.h include/font5x7.h
	mkdir -p plugins/uis
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $<

plugins/uis/console.wasm: plugins/uis/console/main.c include/wesenho.h include/font5x7.h
	mkdir -p plugins/uis
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $<

run: all
	node src/wesenho.js

clean:
	rm -rf roms/*.wasm plugins/uis/*.wasm

.PHONY: all run clean
