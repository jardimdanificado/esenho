#!/usr/bin/env bash
set -euo pipefail
curve_repo_root="$(cd "$(dirname "$0")/.." && pwd)"
curve_kotlinc="${BRUSH_CURVE_KOTLINC:-$HOME/.local/share/android-studio/plugins/Kotlin/kotlinc/bin/kotlinc}"
curve_json_jar="${BRUSH_CURVE_JSON_JAR:-$HOME/.local/share/android-studio/plugins/design-tools/lib/layoutlib.jar}"
curve_java_home="${BRUSH_CURVE_JAVA_HOME:-$HOME/.local/share/android-studio/jbr}"
curve_test_dir="$(mktemp -d /tmp/esenho-curve-tests.XXXXXX)"
cd "$curve_repo_root"
"$curve_java_home/bin/javac" --release 17 -d "$curve_test_dir" \
  android/app/src/main/java/app/esenho/nativeengine/BrushResponseCurve.java \
  android/app/src/main/java/app/esenho/nativeengine/BrushCurveInputs.java \
  android/app/src/main/java/app/esenho/nativeengine/BrushParameterScope.java \
  android/app/src/main/java/app/esenho/nativeengine/BrushPresetAliases.java \
  tests/java/BrushResponseCurveTest.java
"$curve_java_home/bin/java" -cp "$curve_test_dir" BrushResponseCurveTest
JAVA_HOME="$curve_java_home" "$curve_kotlinc" -nowarn -jvm-target 17 \
  -classpath "$curve_test_dir:$curve_json_jar" -include-runtime -d "$curve_test_dir/runtime-tests.jar" \
  android/app/src/main/java/app/esenho/nativeengine/BrushCurveModels.kt \
  android/app/src/main/java/app/esenho/nativeengine/BrushCurveLibrary.kt \
  android/app/src/main/java/app/esenho/nativeengine/BrushCurveRuntime.kt \
  tests/kotlin/BrushCurveRuntimeTest.kt
"$curve_java_home/bin/java" -cp "$curve_test_dir/runtime-tests.jar:$curve_test_dir:$curve_json_jar" \
  app.esenho.nativeengine.BrushCurveRuntimeTestKt "$curve_repo_root" "$curve_test_dir"
