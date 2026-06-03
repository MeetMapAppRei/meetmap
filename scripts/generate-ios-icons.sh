#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_SVG="$ROOT/public/favicon.svg"
ICONSET="$ROOT/ios/App/App/Assets.xcassets/AppIcon.appiconset"
TMP_PNG="$(mktemp /tmp/meetmap-icon.XXXXXX.png)"

cleanup() { rm -f "$TMP_PNG"; }
trap cleanup EXIT

npx --yes @resvg/resvg-js-cli --fit-width 1024 --fit-height 1024 --background "#0A0A0A" "$SRC_SVG" "$TMP_PNG" >/dev/null

# App Store rejects icons with an alpha channel; flatten via JPEG round-trip.
sips -s format jpeg -s formatOptions 100 "$TMP_PNG" --out "${TMP_PNG%.png}-flat.jpg" >/dev/null
sips -s format png "${TMP_PNG%.png}-flat.jpg" --out "$TMP_PNG" >/dev/null
rm -f "${TMP_PNG%.png}-flat.jpg"

gen() {
  sips -z "$2" "$2" "$TMP_PNG" --out "$ICONSET/$1" >/dev/null
}

gen "AppIcon-20@2x.png" 40
gen "AppIcon-20@3x.png" 60
gen "AppIcon-29@2x.png" 58
gen "AppIcon-29@3x.png" 87
gen "AppIcon-40@2x.png" 80
gen "AppIcon-40@3x.png" 120
gen "AppIcon-60@2x.png" 120
gen "AppIcon-60@3x.png" 180
gen "AppIcon-20@1x.png" 20
gen "AppIcon-20@2x-ipad.png" 40
gen "AppIcon-29@1x.png" 29
gen "AppIcon-29@2x-ipad.png" 58
gen "AppIcon-40@1x.png" 40
gen "AppIcon-40@2x-ipad.png" 80
gen "AppIcon-76@1x.png" 76
gen "AppIcon-76@2x.png" 152
gen "AppIcon-83.5@2x.png" 167
cp "$TMP_PNG" "$ICONSET/AppIcon-512@2x.png"

echo "Generated iOS icons in $ICONSET"
