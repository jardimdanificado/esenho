CLANG ?= clang
CFLAGS = --target=wasm32 -nostdlib -fno-builtin -fno-delete-null-pointer-checks -O3 -msimd128 -mbulk-memory -mnontrapping-fptoint -msign-ext -w -Isrc/include
LDFLAGS = -Wl,--no-entry -Wl,--export-all -Wl,--allow-undefined -Wl,--stack-first -Wl,-z,stack-size=65536 -Wl,--initial-memory=67108864 -Wl,--max-memory=2147483648

CORE_WASM = plugins/canvas.wasm
PLUGIN_SRCS = $(wildcard src/plugins/*.c)
PLUGINS = $(patsubst src/plugins/%.c,plugins/%.wasm,$(PLUGIN_SRCS))

BRUSH_CFLAGS = --target=wasm32 -nostdlib -fPIC -fno-builtin -fno-delete-null-pointer-checks -O3 -msimd128 -mbulk-memory -mnontrapping-fptoint -msign-ext -w -Isrc/include
BRUSH_LDFLAGS = -Wl,--no-entry -Wl,--export-all -Wl,--allow-undefined -Wl,--import-memory -Wl,--pie
BRUSH_SRCS = $(wildcard src/plugins/brushes/*.c)
BRUSH_PLUGINS = $(patsubst src/plugins/brushes/%.c,plugins/brushes/%.wasm,$(BRUSH_SRCS))

all: $(CORE_WASM) $(PLUGINS) plugins/manifest.json $(BRUSH_PLUGINS) plugins/brushes/manifest.json bin/quadro-svg

plugins/canvas.wasm: src/quadro.c $(wildcard src/include/*.h)
	mkdir -p plugins
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $<

plugins/%.wasm: src/plugins/%.c src/include/quadro.h src/include/quadro_filter_suite.h src/include/quadro_filter_creative.h
	mkdir -p plugins
	$(CLANG) $(CFLAGS) $(LDFLAGS) -o $@ $<

plugins/brushes/%.wasm: src/plugins/brushes/%.c $(wildcard src/include/quadro*brush*.h) src/include/quadro.h
	mkdir -p plugins/brushes
	$(CLANG) $(BRUSH_CFLAGS) $(BRUSH_LDFLAGS) -o $@ $<

plugins/manifest.json: $(PLUGINS)
	@mkdir -p plugins
	@node -e "const fs=require('fs'); const files=fs.readdirSync('plugins').filter(f=>f.endsWith('.wasm') && f !== 'canvas.wasm').sort(); fs.writeFileSync('plugins/manifest.json', JSON.stringify(files, null, 2));"

plugins/brushes/manifest.json: $(BRUSH_PLUGINS)
	@mkdir -p plugins/brushes
	@node -e "const fs=require('fs'); const files=fs.existsSync('plugins/brushes') ? fs.readdirSync('plugins/brushes').filter(f=>f.endsWith('.wasm')).sort() : []; fs.writeFileSync('plugins/brushes/manifest.json', JSON.stringify(files, null, 2));"

# =========================================================================
# Native C Standalone Targets (Zero Browser Dependency)
# =========================================================================
NATIVE_CC ?= gcc
NATIVE_CFLAGS ?= -O3 -Wall -Wextra -Wno-missing-field-initializers -Wno-unused-parameter -Isrc/include -lm

bin/quadro-svg: src/quadro_svg_cli.c src/svg/quadro_svg.c src/svg/quadro_font.c src/quadro.c $(wildcard src/include/*.h)
	mkdir -p bin
	$(NATIVE_CC) $(NATIVE_CFLAGS) -o $@ src/quadro_svg_cli.c src/svg/quadro_svg.c src/svg/quadro_font.c src/quadro.c -lm

bin/test_native_svg: tests/test_native_svg.c src/svg/quadro_svg.c src/svg/quadro_font.c src/quadro.c $(wildcard src/include/*.h)
	mkdir -p bin
	$(NATIVE_CC) $(NATIVE_CFLAGS) -o $@ tests/test_native_svg.c src/svg/quadro_svg.c src/svg/quadro_font.c src/quadro.c -lm

bin/test_brush_dynamics: tests/test_brush_dynamics.c src/quadro_brush_dynamics.c src/include/quadro_brush_dynamics.h src/include/quadro_brush_realism.h
	mkdir -p bin
	$(NATIVE_CC) $(NATIVE_CFLAGS) -o $@ tests/test_brush_dynamics.c src/quadro_brush_dynamics.c -lm

bin/test_brush_realism: tests/test_brush_realism_state.c src/include/quadro_brush_realism.h
	mkdir -p bin
	$(NATIVE_CC) $(NATIVE_CFLAGS) -o $@ tests/test_brush_realism_state.c -lm

bin/test_brush_coverage: tests/test_brush_coverage.c src/include/quadro_brush_coverage.h
	mkdir -p bin
	$(NATIVE_CC) $(NATIVE_CFLAGS) -o $@ tests/test_brush_coverage.c

native: bin/quadro-svg bin/test_brush_dynamics bin/test_native_svg

test-native: bin/test_brush_dynamics bin/test_brush_coverage bin/test_brush_realism bin/test_native_svg
	./bin/test_brush_dynamics
	./bin/test_brush_coverage
	./bin/test_brush_realism
	./bin/test_native_svg

test-brush-curves:
	bash scripts/test-brush-curves.sh
	node tests/test_saved_brush_curves.js

test-brush-dyn: bin/test_brush_dynamics
	./bin/test_brush_dynamics

# The native Android app compiles its C core and brush/filter plugins through
# CMake. It only needs the generated native registry and metadata below; the
# browser WASM artifacts are not inputs to the APK.
apk:
	node scripts/generate-native-plugins.js
	@TOOLS_DIR="$$HOME/.local/share/esenho-android-tools"; \
	if [ -d "$$TOOLS_DIR/jdk17" ]; then export JAVA_HOME="$$TOOLS_DIR/jdk17"; fi; \
	if [ -d "$$TOOLS_DIR/android-sdk" ]; then export ANDROID_HOME="$$TOOLS_DIR/android-sdk"; export ANDROID_SDK_ROOT="$$ANDROID_HOME"; fi; \
	if [ -f "$$TOOLS_DIR/esenho-release.keystore" ] && [ -z "$$ANDROID_KEYSTORE_PATH" ]; then \
		export ANDROID_KEYSTORE_PATH="$$TOOLS_DIR/esenho-release.keystore"; \
		export ANDROID_KEYSTORE_PASSWORD="esenho123"; \
		export ANDROID_KEY_ALIAS="esenho"; \
		export ANDROID_KEY_PASSWORD="esenho123"; \
	fi; \
	export PATH="$$JAVA_HOME/bin:$$PATH"; \
	./android/gradlew -p android assembleRelease --no-daemon && \
	VERSION=$$(node -p "require('./package.json').version") && \
	cp android/app/build/outputs/apk/release/app-release.apk "esenho-v$${VERSION}.apk" && \
	echo "Built signed APK: esenho-v$${VERSION}.apk"

clean:
	rm -rf plugins/*.wasm plugins/brushes/*.wasm plugins/manifest.json plugins/brushes/manifest.json roms bin android/.gradle android/build android/app/build android/app/src/main/assets

.PHONY: all run clean native test-native test-brush-dyn test-brush-curves apk
