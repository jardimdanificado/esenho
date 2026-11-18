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
# jpackage refuses an existing app image. Only replace our generated output.
rm -rf desktop/build/package/Esenho
"$JAVA_HOME/bin/jpackage" \
  --type app-image \
  --name Esenho \
  --app-version "$(node -p "require('./package.json').version")" \
  --description 'Editor de desenho e animação Esenho' \
  --vendor Esenho \
  --input desktop/build/install/esenho-desktop/lib \
  --main-jar esenho-desktop.jar \
  --main-class app.esenho.desktop.MainKt \
  --add-modules java.base,java.desktop,java.xml,java.logging,java.prefs,java.sql,jdk.unsupported \
  --dest desktop/build/package
tar -czf desktop/build/Esenho-linux.tar.gz -C desktop/build/package Esenho
printf 'Pacote Linux: %s/desktop/build/Esenho-linux.tar.gz\n' "$PWD"
