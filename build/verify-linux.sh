#!/bin/bash
# CI: the .deb must install and the .deb and the AppImage must start (installs what it needs)
set -euo pipefail
deb=$(ls dist/*.deb)
appimage=$(ls dist/*.AppImage)
sudo apt-get update -qq
sudo apt-get install -y -qq xvfb dbus fuse3 desktop-file-utils "./$deb" >/dev/null

desktop=/usr/share/applications/tct-orbit.desktop
desktop-file-validate "$desktop"
grep -q 'MimeType=.*text/html' "$desktop" || { echo "::error::The menu entry does not handle web pages"; exit 1; }
# Menus only look in the icon theme's own sizes (512 is the largest everywhere)
[ -f /usr/share/icons/hicolor/256x256/apps/tct-orbit.png ] || { echo "::error::The menu icon is missing"; exit 1; }

# The browser's own interface is loaded
ui_loaded() {
  local pages
  pages=$(curl -s -m 5 "http://127.0.0.1:$1/json/list" || true)
  [[ "$pages" == *renderer/index.html* ]]
}

starts() {
  local name=$1 port=$2
  shift 2
  local work
  work=$(mktemp -d)
  xvfb-run -a dbus-run-session -- "$@" --user-data-dir="$work/profile" --remote-debugging-port="$port" >"$work/app.log" 2>&1 &
  local pid=$!
  for _ in $(seq 1 60); do
    sleep 1
    if ui_loaded "$port"; then
      sleep 3
      if ui_loaded "$port"; then
        echo "$name starts: yes"
        kill "$pid" 2>/dev/null || true
        pkill -f "remote-debugging-port=$port" || true
        return 0
      fi
    fi
    kill -0 "$pid" 2>/dev/null || break
  done
  tail -40 "$work/app.log"
  echo "::error::$name does not start"
  return 1
}

starts ".deb" 9411 tct-orbit
chmod +x "$appimage"
# The way a user starts it, so this also proves it needs no extra FUSE library
starts "AppImage" 9412 "$appimage"
