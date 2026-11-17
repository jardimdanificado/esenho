#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${1:-}" == "--benchmark" ]]; then exec ./desktop/benchmark.sh "$@"; fi
if [[ -z "${JAVA_HOME:-}" ]]; then
  if [[ -d "$HOME/.local/share/esenho-android-tools/jdk17" ]]; then
    JAVA_HOME="$HOME/.local/share/esenho-android-tools/jdk17"
  else
    JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")"
  fi
fi
export JAVA_HOME
./android/gradlew -p desktop installDist --quiet
exec "$JAVA_HOME/bin/java" -Djava.library.path=desktop/build/native -Desenho.version="$(node -p "require('./package.json').version")" -cp 'desktop/build/install/esenho-desktop/lib/*' app.esenho.desktop.MainKt "$@"
