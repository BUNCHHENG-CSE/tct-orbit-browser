#!/bin/bash
# CI: every .dmg must hold a validly signed app that really starts.
# An app without a valid signature is shown to users as "damaged and can't be opened".
set -euo pipefail
found=0
for dmg in dist/*.dmg; do
  found=$((found + 1))
  echo "== $dmg"
  mnt=$(mktemp -d)
  work=$(mktemp -d)
  hdiutil attach "$dmg" -nobrowse -readonly -mountpoint "$mnt" >/dev/null
  ditto "$mnt/TCT Orbit.app" "$work/TCT Orbit.app"
  hdiutil detach "$mnt" >/dev/null || true
  app="$work/TCT Orbit.app"
  bin="$app/Contents/MacOS/TCT Orbit"

  codesign --verify --deep --strict --verbose=2 "$app"
  codesign -dv "$app" 2>&1 | grep -E "Identifier|Signature|Sealed|flags" || true

  arch=$(lipo -archs "$bin")
  echo "architecture: $arch"
  case "$dmg" in
    *arm64.dmg) [ "$arch" = "arm64" ] ;;
    *x64.dmg) [ "$arch" = "x86_64" ] ;;
  esac

  if [ "$arch" = "x86_64" ] && ! arch -x86_64 /usr/bin/true 2>/dev/null; then
    echo "::warning::Rosetta is not available: the Intel app was not started"
    continue
  fi
  "$bin" --user-data-dir="$work/profile" --use-mock-keychain >"$work/app.log" 2>&1 &
  pid=$!
  started=0
  # The first Intel start is slow: Rosetta translates the whole app
  for _ in $(seq 1 150); do
    sleep 1
    kill -0 "$pid" 2>/dev/null || break
    if pgrep -f "$work/TCT Orbit.app.*Helper \(Renderer\)" >/dev/null; then
      started=1
      break
    fi
  done
  # A crash right after the first window counts too
  [ "$started" = 1 ] && sleep 5
  if [ "$started" != 1 ] || ! kill -0 "$pid" 2>/dev/null; then
    tail -50 "$work/app.log"
    echo "::error::$dmg does not start"
    exit 1
  fi
  echo "starts: yes"
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
done
if [ "$found" -lt 2 ]; then
  echo "::error::Expected an Apple Silicon and an Intel .dmg, found $found"
  exit 1
fi
