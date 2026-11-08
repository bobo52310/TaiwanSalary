#!/bin/bash
# usage: norm.sh <in.png> <out-base>   -> <out-base>.webp (512, subject ~FILL of width, centered)
in=$1; out=$2; FILL=${FILL:-0.70}
bg=$(magick "$in" -format "#%[hex:p{4,4}]" info:)
read -r w h x y < <(magick "$in" -fuzz 18% -trim -format "%w %h %X %Y" info: | tr -d '+' | sed 's/-/ -/g')
side=$(python3 -c "print(int(max($w,$h)/$FILL))")
cx=$((x + w/2)); cy=$((y + h/2)); ox=$((cx - side/2)); oy=$((cy - side/2))
og=$(printf "%+d%+d" $ox $oy)
magick "$in" -background "$bg" -extent "${side}x${side}${og}" -resize 512x512 -quality 82 "$out.webp"
echo "$(basename "$out") bbox=${w}x${h}@${x},${y} fill_before=$(python3 -c "print(round(max($w,$h)/1254,2))") side=$side"
