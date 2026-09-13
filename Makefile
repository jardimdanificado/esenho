CLANG ?= clang
CFLAGS = --target=wasm32 -nostdlib -fno-delete-null-pointer-checks -O3 -w -Iinclude
LDFLAGS = -Wl,--no-entry -Wl,--export-all -Wl,--allow-undefined -Wl,--stack-first -Wl,-z,stack-size=65536 -Wl,--initial-memory=4194304

ROMS = roms/ui.wasm roms/canvas.wasm

all: $(ROMS)

roms/ui.wasm: actors/ui/main.c include/wesenho.h
	mkdir -p roms
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $<

roms/canvas.wasm: actors/canvas/main.c include/wesenho.h
	mkdir -p roms
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $<

run: all
	node src/wesenho.js

clean:
	rm -rf roms/*.wasm

.PHONY: all run clean
