#!/bin/bash
set -e
FFMPEG="$HOME/.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux"
FRAMES="/home/user/dbt-vscode-extension/demo/frames/f%04d.png"
OUT="/home/user/dbt-vscode-extension/demo/dag-demo.gif"

$FFMPEG -y -framerate 10 -i "$FRAMES" \
  -vf "fps=10,scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" \
  "$OUT"
echo "Done: $OUT"
ls -lh "$OUT"
