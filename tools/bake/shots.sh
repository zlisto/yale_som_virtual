#!/bin/bash
# usage: tools/bake/shots.sh <prefix> [extra query] -> $OUT/<prefix>_<view>.png
OUT=${OUT:-/Users/lan.luoyale.edu/.claude/jobs/3357d749/tmp/bake}
BASE=${BASE:-http://localhost:5190/}
cd "$(dirname "$0")"
declare -a V=(
  "corridor=-24.4,1.65,22,0,0"
  "courtyard=-23,1.65,-6,-65,5"
  "drum=0,2.9,36.5,0,-8"
  "library=-30,1.65,10,30,-3"
  "north=-10,1.65,-22.5,-90,2"
  "beinecke=21,1.65,0,-90,0"
)
for v in "${V[@]}"; do
  k=${v%%=*}; c=${v#*=}
  [ -n "$ONLY" ] && [[ ",$ONLY," != *",$k,"* ]] && continue
  node shot.mjs "${BASE}?nolock=1&hud=0&quality=high&dpr=1&cam=${c}$2" "$OUT/${1}_${k}.png"
done
