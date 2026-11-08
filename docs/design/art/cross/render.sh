#!/bin/bash
# Render the TaxMap cross-promotion banner -> docs/promo/cross/taxmap-banner.png (1200x630).
#
#   pnpm exec tsx docs/design/art/cross/build-map.ts   # only when TaxMap's data changes
#   docs/design/art/cross/render.sh
#
# banner.svg points at taxmap-map.svg with <image> so it previews in a browser, but
# rsvg-convert rasterises a referenced SVG at its intrinsic size before scaling it, which
# blurs the village polygons. So the map is inlined as a nested <svg> into a temp copy
# first. Every word and figure is typed in banner.svg (sources noted there).
# Requires rsvg-convert, node, Noto Sans TC, and Songti TC or Noto Serif TC (the 里 tile).
set -euo pipefail
cd "$(dirname "$0")"
OUT=../../../promo/cross
mkdir -p "$OUT"
TMP=.banner-inlined.svg # must sit next to bg.jpg: librsvg only loads files beside the SVG
trap 'rm -f "$TMP"' EXIT

node -e '
const fs = require("fs");
const [banner, map, out] = process.argv.slice(1);
const b = fs.readFileSync(banner, "utf8");
const m = fs.readFileSync(map, "utf8");
const viewBox = m.match(/viewBox="([^"]+)"/)[1];
const inner = m.replace(/<!--[\s\S]*?-->\s*/, "").replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const tag = /<image href="taxmap-map.svg" ([^>]*)\/>/;
if (!tag.test(b)) throw new Error("banner.svg has no <image href=\"taxmap-map.svg\" …/>");
fs.writeFileSync(out, b.replace(tag, (_, attrs) =>
  `<svg ${attrs} viewBox="${viewBox}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`));
' banner.svg taxmap-map.svg "$TMP"

rsvg-convert "$TMP" -o "$OUT/taxmap-banner.png"
echo "$OUT/taxmap-banner.png"
