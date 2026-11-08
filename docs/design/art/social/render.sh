#!/bin/bash
# Render the social post images: text-free AI plates (bg-*.jpg) + SVG text overlay
# -> docs/promo/social/{fb,threads,linkedin}.png. Figures are typed into the SVGs and
# must match docs/social-posts.md (114 年度). Requires rsvg-convert + Noto Sans TC.
set -euo pipefail
cd "$(dirname "$0")"
OUT=../../../promo/social
mkdir -p "$OUT"
for n in fb linkedin threads; do
  rsvg-convert "$n.svg" -o "$OUT/$n.png"
  echo "$OUT/$n.png"
done
