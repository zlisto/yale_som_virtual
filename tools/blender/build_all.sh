#!/usr/bin/env bash
# Rebuild every character GLB into public/models/ (Draco-compressed). Usage: npm run models
# Set CHAR_PREVIEWS=/some/dir to also render EEVEE preview PNGs of each clip.
set -euo pipefail
cd "$(dirname "$0")/../.."
BLENDER="${BLENDER:-$(command -v blender || echo /Applications/Blender.app/Contents/MacOS/Blender)}"
mkdir -p public/models
for script in labubu froggy handsome_dan professor; do
  if [ -f "tools/blender/$script.py" ]; then
    echo "== $script"
    "$BLENDER" -b --factory-startup -P "tools/blender/$script.py" 2>&1 | grep -E '^\[(labubu|export|dan|professor)\]|Error|Traceback' || true
  fi
done
ls -l public/models
