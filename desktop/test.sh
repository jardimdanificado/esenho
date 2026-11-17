#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -z "${JAVA_HOME:-}" ]]; then
  if [[ -d "$HOME/.local/share/esenho-android-tools/jdk17" ]]; then
    JAVA_HOME="$HOME/.local/share/esenho-android-tools/jdk17"
  else
    JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")"
  fi
fi
export JAVA_HOME
./android/gradlew -p desktop installDist --quiet
TEST_DIR="$(mktemp -d /tmp/esenho-desktop-test-XXXXXX)"
trap 'rm -rf "$TEST_DIR"' EXIT
export XDG_DATA_HOME="$TEST_DIR/data"
export XDG_CACHE_HOME="$TEST_DIR/cache"
"$JAVA_HOME/bin/java" -Djava.awt.headless=true -cp 'desktop/build/install/esenho-desktop/lib/*' app.esenho.desktop.MainKt --smoke-test
if [[ "${1:-}" == "--ui" ]]; then
  "$JAVA_HOME/bin/java" -cp 'desktop/build/install/esenho-desktop/lib/*' app.esenho.desktop.MainKt --ui-smoke-test
fi
