#!/usr/bin/env bash
# content-creator · pasang / perbarui workspace di komputer ini (macOS atau Linux).
#
#   bash bin/setup.sh [WORKSPACE] [--skip-model] [--skip-browsers]
#
# - WORKSPACE: folder data Anda (Projects/, Brands/, Result/, Engine/). Bawaan: isi ~/.config/content-creator/workspace,
#   atau ~/ContentCreator bila belum pernah diatur.
# - Aman dijalankan berulang (mis. setelah plugin diperbarui): mesin di <WORKSPACE>/Engine diganti versi plugin, tetapi
#   data & pengaturan workspace TIDAK disentuh: config.local.json, src/pop/custom/, voices/, work/, public/brand|audio|media,
#   .env.local, dan semua isi Projects/ Brands/ References/ Result/.
# - Tidak memakai sudo. Bila ada yang kurang, skrip berhenti dan menampilkan perintah pemasangan untuk OS Anda.
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CFG_DIR="$HOME/.config/content-creator"
WS_FILE="$CFG_DIR/workspace"
SKIP_MODEL=0
SKIP_BROWSERS=0
WS=""
for a in "$@"; do
  case "$a" in
    --skip-model) SKIP_MODEL=1 ;;
    --skip-browsers) SKIP_BROWSERS=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) WS="$a" ;;
  esac
done
if [ -z "$WS" ] && [ -f "$WS_FILE" ]; then WS="$(cat "$WS_FILE")"; fi
WS="${WS:-$HOME/ContentCreator}"
mkdir -p "$WS"
WS="$(cd "$WS" && pwd)"
OS="$(uname -s)"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  OK    %s\n' "$*"; }
miss=()

say "1/7 Memeriksa alat dasar ($OS)"
need() { if command -v "$1" >/dev/null 2>&1; then ok "$1 ($("$1" ${2:---version} 2>&1 | head -1))"; else miss+=("$1"); printf '  KURANG %s\n' "$1"; fi; }
need node; need npm; need ffmpeg -version; need ffprobe -version; need python3; need rsync; need uv
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$NODE_MAJOR" -ge 20 ] || { echo "  Node $NODE_MAJOR terlalu lama (butuh >= 20)"; miss+=("node>=20"); }
fi
if command -v ffmpeg >/dev/null 2>&1 && ! ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264; then miss+=("ffmpeg-libx264"); echo "  ffmpeg tanpa libx264"; fi
if [ ${#miss[@]} -gt 0 ]; then
  say "Pasang dulu: ${miss[*]}"
  if [ "$OS" = "Darwin" ]; then
    echo "  brew install node ffmpeg python@3.12 uv rsync rclone"
  else
    echo "  sudo apt-get update && sudo apt-get install -y ffmpeg python3 python3-venv rsync curl"
    echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
    echo "  curl -LsSf https://astral.sh/uv/install.sh | sh"
    echo "  (opsional, untuk unggah Google Drive) sudo apt-get install -y rclone"
  fi
  echo "Lalu jalankan ulang skrip ini."
  exit 1
fi

say "2/7 Workspace: $WS"
mkdir -p "$WS"/{Projects,Brands,References,Result}
copy_once() { [ -e "$WS/$1" ] || { mkdir -p "$(dirname "$WS/$1")"; cp "$PLUGIN_ROOT/template/$1" "$WS/$1"; ok "dibuat $1"; }; }
for f in CLAUDE.md .gitignore Projects/README.md Brands/README.md Brands/_selera.md References/README.md Result/README.md; do copy_once "$f"; done

say "3/7 Menyalin mesin ke $WS/Engine (data workspace tidak disentuh)"
mkdir -p "$WS/Engine"
rsync -a --delete \
  --exclude node_modules --exclude .venv --exclude work --exclude config.local.json --exclude .env --exclude '.deps-*' \
  --exclude src/pop/custom --exclude voices --exclude public/brand --exclude public/audio --exclude public/media \
  --exclude public/sfx/eleven --exclude .DS_Store \
  "$PLUGIN_ROOT/engine/" "$WS/Engine/"
mkdir -p "$WS/Engine/src/pop/custom" "$WS/Engine/voices"
[ -e "$WS/Engine/src/pop/custom/example.tsx" ] || cp "$PLUGIN_ROOT/engine/src/pop/custom/example.tsx" "$WS/Engine/src/pop/custom/"
[ -e "$WS/Engine/config.local.json" ] || printf '{\n  "elevenlabs": { "voice": "George", "voices": {} },\n  "drive": { "remote": "gdrive", "rootFolderId": "", "rootName": "" }\n}\n' > "$WS/Engine/config.local.json"
ok "mesin versi $(node -p "require('$PLUGIN_ROOT/.claude-plugin/plugin.json').version")"

cd "$WS/Engine"
say "4/7 Dependensi Node (npm ci)"
LOCKHASH="$( (shasum package-lock.json 2>/dev/null || sha1sum package-lock.json) | cut -d' ' -f1)"
if [ -d node_modules ] && [ "$(cat .deps-npm 2>/dev/null)" = "$LOCKHASH" ]; then ok "sudah terpasang"; else npm ci --no-audit --no-fund && echo "$LOCKHASH" > .deps-npm && ok "terpasang"; fi

say "5/7 Python venv (analisis audio, motion graphics, HTML)"
PYREQ='faster-whisper==1.2.1 numpy soundfile scipy resemblyzer setuptools<81 playwright pillow'
if [ -x .venv/bin/python ] && [ "$(cat .deps-py 2>/dev/null)" = "$PYREQ" ]; then ok "sudah terpasang"; else
  [ -x .venv/bin/python ] || uv venv .venv --python 3.12 --python-preference only-managed
  # shellcheck disable=SC2086
  uv pip install --python .venv/bin/python $PYREQ && echo "$PYREQ" > .deps-py && ok "terpasang"
fi

say "6/7 Browser render (Chromium Playwright + Chrome Headless Remotion)"
if [ "$SKIP_BROWSERS" = 1 ]; then ok "dilewati (--skip-browsers)"; else
  if [ "$OS" = "Linux" ]; then
    .venv/bin/python -m playwright install chromium || true
    .venv/bin/python -m playwright install-deps chromium 2>/dev/null || echo "  ! Library sistem Chromium belum lengkap. Jalankan: sudo $WS/Engine/.venv/bin/python -m playwright install-deps chromium"
  else
    .venv/bin/python -m playwright install chromium
  fi
  node -e "require('@remotion/renderer').ensureBrowser().then(()=>console.log('  OK    Chrome Headless Remotion'))"
fi

say "7/7 Model transkripsi (whisper large-v3-turbo, ±1,6 GB, sekali)"
if [ "$SKIP_MODEL" = 1 ]; then ok "dilewati (--skip-model)"; else
  .venv/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('deepdml/faster-whisper-large-v3-turbo-ct2', device='cpu', compute_type='int8'); print('  OK    model siap')"
fi

mkdir -p "$CFG_DIR" && printf '%s\n' "$WS" > "$WS_FILE"
say "Selesai. Workspace tercatat di $WS_FILE"
npm run -s check || true
cat <<EOF

Langkah berikutnya (sekali per komputer):
  1. Key ElevenLabs (di root workspace):  cd "$WS" && npx -y @elevenlabs/cli@latest onboard init
  2. Voice default & daftar voice:        $WS/Engine/config.local.json  (atau: cd "$WS/Engine" && npm run voices)
  3. (Opsional) Google Drive:             brew/apt install rclone, lalu
                                          rclone config create gdrive drive scope=drive root_folder_id=<ID folder>
                                          dan isi "drive.rootFolderId" di config.local.json
  4. (Opsional) Jalur B motion-graphics-v4: pasang skill Anthropic itu ke ~/.claude/skills/motion-graphics-v4
  5. Uji semua jalur:                     cd "$WS/Engine" && npm run selftest
Lalu buka Claude Code di mana saja dan ketik: /content-creator <ide video>
EOF
