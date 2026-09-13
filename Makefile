CLANG ?= clang
CFLAGS = --target=wasm32 -nostdlib -fno-delete-null-pointer-checks -O3 -w -Iinclude
LDFLAGS = -Wl,--no-entry -Wl,--export-all -Wl,--allow-undefined -Wl,--stack-first -Wl,-z,stack-size=65536 -Wl,--initial-memory=33554432

ROMS = roms/canvas.wasm roms/tools.wasm roms/palette.wasm roms/layers.wasm

all: $(ROMS)

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

run: all
	node src/wesenho.js

clean:
	rm -rf roms/*.wasm

.PHONY: all run clean
