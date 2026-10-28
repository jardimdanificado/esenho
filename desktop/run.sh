#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -z "${JAVA_HOME:-}" ]]; then
  if command -v javac >/dev/null; then JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")";
  else JAVA_HOME="$HOME/.local/share/esenho-android-tools/jdk17"; fi
fi
export JAVA_HOME
mkdir -p desktop/build/native
cc -O3 -fPIC -shared -I"$JAVA_HOME/include" -I"$JAVA_HOME/include/linux" -Isrc/include desktop/esenho_desktop.c src/quadro.c -o desktop/build/native/libesenho_desktop.so -lm
./android/gradlew -p desktop installDist --quiet
exec "$JAVA_HOME/bin/java" -Djava.library.path=desktop/build/native -cp 'desktop/build/install/esenho-desktop/lib/*' EsenhoDesktop "$@"
