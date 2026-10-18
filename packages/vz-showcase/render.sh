#!/usr/bin/env bash
# Render the before/after showcase videos for the cc/* branches.
#
#   packages/vz-showcase/render.sh [--out DIR] [--force] [--skip-before] [--skip-all] [--compare] [name ...]
#
# For every cc/<name> branch that has a project in src/projects (or only the
# names given), this
#   1. renders every project once on canvas-commons main ("before"),
#   2. renders src/projects/<name>.ts on cc/<name> ("after"),
#   3. stitches before|after side by side into <out>/<name>.mp4,
#   4. renders src/projects/all.ts on videozero-cc into all-videozero-cc.mp4,
#   5. writes contact-sheet.png with one frame per branch.
# With --compare, steps 2-5 are replaced by rendering every project on
# videozero-cc and joining main|videozero-cc pairs into compare-all.mp4.
# SHOWCASE_SCALE=2 renders in full HD.
# Each ref is rendered in a temporary detached worktree (WT_ROOT/render-*)
# that gets this package copied in, `pnpm install`, the needed packages
# built, and is removed again afterwards. Clips that already exist in <out>
# are kept (so an interrupted run resumes) unless --force is given.
#
# Environment: REPO (git repository, default: the one this file lives in),
#   WT_ROOT (default /home/user/wt), BEFORE_REF (default cc/main),
#   ALL_REF (default videozero-cc), SHOWCASE_SCALE (1 = 960x540, 2 = full
#   HD), CHROMIUM_PATH, FFMPEG.
set -euo pipefail

PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${REPO:-$(git -C "$PKG" rev-parse --path-format=absolute --git-common-dir)}"
WT_ROOT="${WT_ROOT:-/home/user/wt}"
BEFORE_REF="${BEFORE_REF:-cc/main}"
ALL_REF="${ALL_REF:-videozero-cc}"
FFMPEG="${FFMPEG:-ffmpeg}"
export SHOWCASE_SCALE="${SHOWCASE_SCALE:-1}"
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
OUT="$PKG/output/showcase"
SKIP_BEFORE=0
SKIP_ALL=0
FORCE=0
COMPARE=0
NAMES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    --skip-before) SKIP_BEFORE=1; shift ;;
    --skip-all) SKIP_ALL=1; shift ;;
    --force) FORCE=1; shift ;;
    --compare) COMPARE=1; shift ;;
    *) NAMES+=("$1"); shift ;;
  esac
done
mkdir -p "$OUT/before" "$OUT/after" "$OUT/frames"
OUT="$(cd "$OUT" && pwd)"

if [ ${#NAMES[@]} -eq 0 ]; then
  while read -r ref; do
    name="${ref#cc/}"
    [ -f "$PKG/src/projects/$name.ts" ] && NAMES+=("$name")
  done < <(git --git-dir="$REPO" for-each-ref --format='%(refname:short)' 'refs/heads/cc/*')
fi
echo "branches: ${NAMES[*]}"

OPTIONAL=(three d3-geo echarts shiki rig)

# prepare <ref> <dir>: worktree + showcase copy + install + build
prepare() {
  local ref="$1" dir="$2"
  git --git-dir="$REPO" worktree remove --force "$dir" 2>/dev/null || true
  rm -rf "$dir"
  git --git-dir="$REPO" worktree add --detach "$dir" "$ref" >/dev/null
  mkdir -p "$dir/packages/vz-showcase"
  tar -C "$PKG" --exclude=./output --exclude=./node_modules -cf - . |
    tar -C "$dir/packages/vz-showcase" -xf -
  (
    cd "$dir"
    HUSKY=0 pnpm install --prefer-offline --no-frozen-lockfile --reporter=silent
    pnpm --filter @canvas-commons/core run build >/dev/null
    pnpm --filter @canvas-commons/2d run build >/dev/null
    local filters=(--filter @canvas-commons/vite-plugin --filter @canvas-commons/editor)
    for pkg in "${OPTIONAL[@]}"; do
      [ -f "packages/$pkg/package.json" ] && filters+=(--filter "@canvas-commons/$pkg")
    done
    pnpm "${filters[@]}" run build >/dev/null
  )
}

cleanup() {
  local dir="$1"
  git --git-dir="$REPO" worktree remove --force "$dir" 2>/dev/null || rm -rf "$dir"
  git --git-dir="$REPO" worktree prune
}

# render <dir> <outdir> <project...>
render() {
  local dir="$1" out="$2"
  shift 2
  (cd "$dir/packages/vz-showcase" && node render.mjs --out "$out" "$@")
}

duration() {
  ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"
}

# stitch <name>: before|after with labels
# stitch <name> [after-dir] [right label] [target]
stitch() {
  local name="$1" before="$OUT/before/$1.mp4" after="$OUT/${2:-after}/$1.mp4"
  local right="${3:-cc/$1}" target="${4:-$OUT/$1.mp4}"
  local d1 d2 d
  d1=$(duration "$before")
  d2=$(duration "$after")
  d=$(python3 -c "print(max($d1, $d2))")
  local bar=$((44 * SHOWCASE_SCALE))
  local label="drawbox=y=0:w=iw:h=$bar:color=0x0b0f14:t=fill,drawtext=fontfile=$FONT:fontsize=$((24 * SHOWCASE_SCALE)):x=(w-tw)/2:y=$((10 * SHOWCASE_SCALE))"
  "$FFMPEG" -loglevel error -y -i "$before" -i "$after" -filter_complex \
    "[0:v]tpad=stop_mode=clone:stop_duration=60,pad=iw:ih+$bar:0:$bar,${label}:fontcolor=0xf0883e:text='canvas-commons main'[a];\
[1:v]tpad=stop_mode=clone:stop_duration=60,pad=iw:ih+$bar:0:$bar,${label}:fontcolor=0x3fb950:text='$right'[b];\
[a][b]hstack=inputs=2,drawbox=x=iw/2-2:y=0:w=4:h=ih:color=0x30363d:t=fill[v]" \
    -map '[v]' -t "$d" -r 30 -c:v libx264 -pix_fmt yuv420p -crf 21 "$target"
}

# todo <side> <name...>: the names whose clip is missing on that side
todo() {
  local side="$1"
  shift
  for name in "$@"; do
    if [ "$FORCE" -eq 1 ] || [ ! -f "$OUT/$side/$name.mp4" ]; then
      echo "$name"
    fi
  done
}

if [ "$SKIP_BEFORE" -eq 0 ]; then
  mapfile -t pending < <(todo before "${NAMES[@]}")
  if [ ${#pending[@]} -gt 0 ]; then
    dir="$WT_ROOT/render-main"
    prepare "$BEFORE_REF" "$dir"
    render "$dir" "$OUT/before" "${pending[@]}"
    cleanup "$dir"
  fi
fi

if [ "$COMPARE" -eq 1 ]; then
  # Every scene on canvas-commons main next to the same scene on $ALL_REF,
  # joined into one video.
  mkdir -p "$OUT/vzcc" "$OUT/compare"
  mapfile -t pending < <(todo vzcc "${NAMES[@]}")
  if [ ${#pending[@]} -gt 0 ]; then
    dir="$WT_ROOT/render-compare"
    prepare "$ALL_REF" "$dir"
    render "$dir" "$OUT/vzcc" "${pending[@]}"
    cleanup "$dir"
  fi
  list="$OUT/compare/list.txt"
  : >"$list"
  for name in "${NAMES[@]}"; do
    stitch "$name" vzcc "$ALL_REF" "$OUT/compare/$name.mp4"
    echo "file '$OUT/compare/$name.mp4'" >>"$list"
  done
  "$FFMPEG" -loglevel error -y -f concat -safe 0 -i "$list" -c copy \
    "$OUT/compare-all.mp4"
  echo "done: $OUT/compare-all.mp4"
  exit 0
fi

for name in "${NAMES[@]}"; do
  if [ -n "$(todo after "$name")" ]; then
    dir="$WT_ROOT/render-$name"
    prepare "cc/$name" "$dir"
    render "$dir" "$OUT/after" "$name"
    cleanup "$dir"
  fi
  stitch "$name"
done

if [ "$SKIP_ALL" -eq 0 ] && [ -n "$(todo after all)" ]; then
  dir="$WT_ROOT/render-videozero-cc"
  prepare "$ALL_REF" "$dir"
  render "$dir" "$OUT/after" all
  cleanup "$dir"
fi
[ -f "$OUT/after/all.mp4" ] && cp "$OUT/after/all.mp4" "$OUT/all-videozero-cc.mp4"


# Contact sheet: one frame per branch at 70% of the clip, 4 columns.
cells=()
for name in "${NAMES[@]}"; do
  [ -f "$OUT/$name.mp4" ] || continue
  d=$(duration "$OUT/$name.mp4")
  t=$(python3 -c "print(round($d * 0.7, 2))")
  "$FFMPEG" -loglevel error -y -ss "$t" -i "$OUT/$name.mp4" -frames:v 1 \
    -vf "scale=640:-2,pad=iw:ih+30:0:30:color=0x0b0f14,drawtext=fontfile=$FONT:fontsize=18:fontcolor=white:x=8:y=6:text='$name'" \
    "$OUT/frames/$name.png"
  cells+=("$OUT/frames/$name.png")
done
if [ ${#cells[@]} -gt 0 ]; then
  cols=4
  inputs=()
  for c in "${cells[@]}"; do inputs+=(-i "$c"); done
  n=${#cells[@]}
  rows=$(((n + cols - 1) / cols))
  # pad the grid with blank cells
  while [ $((n % cols)) -ne 0 ]; do
    inputs+=(-f lavfi -i "color=c=0x0b0f14:s=640x$(ffprobe -v error -select_streams v -show_entries stream=height -of csv=p=0 "${cells[0]}"),trim=end_frame=1")
    n=$((n + 1))
  done
  layout=""
  for ((i = 0; i < n; i++)); do
    x=$((i % cols)); y=$((i / cols))
    xs="0"; ys="0"
    for ((k = 0; k < x; k++)); do xs="${xs}+w0"; done
    for ((k = 0; k < y; k++)); do ys="${ys}+h0"; done
    layout="${layout}${layout:+|}${xs}_${ys}"
  done
  "$FFMPEG" -loglevel error -y "${inputs[@]}" -filter_complex "xstack=inputs=$n:layout=$layout" \
    -frames:v 1 "$OUT/contact-sheet.png"
  echo "contact sheet: $OUT/contact-sheet.png ($rows rows)"
fi
echo "done: $OUT"
