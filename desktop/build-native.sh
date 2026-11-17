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
node scripts/generate-native-plugins.js
cmake -S desktop -B desktop/build/native -DCMAKE_BUILD_TYPE=Release
cmake --build desktop/build/native --parallel 2
