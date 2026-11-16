#!/usr/bin/env bash
# content-creator · pasang / perbarui workspace di komputer ini (macOS atau Linux), termasuk SEMUA komponen pendukung.
#
#   bash bin/setup.sh [WORKSPACE] [--with-whisper] [--skip-browsers]
#
# Yang dipasang otomatis bila belum ada (tanpa langkah manual):
#   Node.js 22, ffmpeg (libx264), uv + Python 3.12, rclone, dependensi npm & Python, Chromium (Playwright + Remotion),
#   library sistem Chromium (Linux), OpenCV (deteksi wajah untuk edit footage). Sinkron kata memakai timestamps ElevenLabs, jadi model transkripsi tidak wajib.
# --with-whisper: tambahan opsional faster-whisper + model large-v3-turbo (±1,8 GB) untuk QA kejelasan kata gratis,
#   sinkron offline, dan VoiceStudio. Sekali dipasang, setup berikutnya ikut memperbaruinya.
# Cara memasang: Homebrew (macOS, bila ada) · apt (Linux, bila root / sudo tanpa password) · selain itu unduhan resmi
#   ke folder pengguna ~/.local/share/content-creator/tools (tanpa sudo; checksum diverifikasi bila tersedia).
# Aman dijalankan berulang (mis. setelah plugin diperbarui): mesin di <WORKSPACE>/Engine diganti versi plugin, tetapi
#   data & pengaturan workspace TIDAK disentuh: config.local.json, src/pop/custom/, voices/, work/, public/brand|audio|media,
#   .env.local, dan semua isi Projects/ Brands/ References/ Result/.
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CFG_DIR="$HOME/.config/content-creator"
WS_FILE="$CFG_DIR/workspace"
TOOLS="$HOME/.local/share/content-creator/tools"
TB="$TOOLS/bin"
WITH_WHISPER=0
SKIP_BROWSERS=0
WS=""
for a in "$@"; do
  case "$a" in
    --with-whisper) WITH_WHISPER=1 ;;
    --skip-model) ;; # lama: model kini opsional (--with-whisper)
    --skip-browsers) SKIP_BROWSERS=1 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) WS="$a" ;;
  esac
done
if [ -z "$WS" ] && [ -f "$WS_FILE" ]; then WS="$(cat "$WS_FILE")"; fi
WS="${WS:-$HOME/ContentCreator}"
mkdir -p "$WS" "$TB"
WS="$(cd "$WS" && pwd)"
export PATH="$TB:$HOME/.local/bin:$PATH"
OS="$(uname -s)"
case "$(uname -m)" in x86_64|amd64) ARCH=x64; ARCH2=amd64 ;; arm64|aarch64) ARCH=arm64; ARCH2=arm64 ;; *) echo "Arsitektur $(uname -m) belum didukung"; exit 1 ;; esac
if [ "$(id -u)" = 0 ]; then SUDO=""; elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then SUDO="sudo"; else SUDO="NONE"; fi

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  OK    %s\n' "$*"; }
info() { printf '  ..    %s\n' "$*"; }
die() { printf '\n  GAGAL %s\n' "$*"; exit 1; }
has() { command -v "$1" >/dev/null 2>&1; }
APT_UPDATED=0
apt_install() {
  [ "$OS" = Linux ] && has apt-get && [ "$SUDO" != NONE ] || return 1
  if [ "$APT_UPDATED" = 0 ]; then $SUDO apt-get update -qq && APT_UPDATED=1; fi
  info "apt install $*"
  $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" >/dev/null
}
brew_install() { [ "$OS" = Darwin ] && has brew || return 1; info "brew install $*"; brew install "$@" >/dev/null; }
fetch() { curl -fsSL --retry 3 -o "$2" "$1"; }
sha256() { if has shasum; then shasum -a 256 "$1" | cut -d' ' -f1; else sha256sum "$1" | cut -d' ' -f1; fi; }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT

say "1/8 Komponen pendukung ($OS $ARCH)"
# alat dasar Linux untuk mengunduh/membongkar
if [ "$OS" = Linux ]; then
  base=(); for c in curl unzip xz; do has "$c" || base+=("$c"); done
  if [ ${#base[@]} -gt 0 ]; then apt_install curl ca-certificates unzip xz-utils || die "butuh ${base[*]}; jalankan: sudo apt-get install -y curl ca-certificates unzip xz-utils"; fi
fi
has curl || die "butuh curl"

# Node.js >= 20
node_ok() { has node && [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 20 ]; }
if ! node_ok; then
  brew_install node || {
    NOS=$([ "$OS" = Darwin ] && echo darwin || echo linux)
    info "mengunduh Node.js 22 (nodejs.org)"
    fetch https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt "$TMPD/SHASUMS256.txt"
    FILE="$(grep -oE "node-v[0-9.]+-$NOS-$ARCH\.tar\.xz" "$TMPD/SHASUMS256.txt" | sed -n 1p)"
    [ -n "$FILE" ] || die "Node untuk $NOS-$ARCH tidak ditemukan"
    fetch "https://nodejs.org/dist/latest-v22.x/$FILE" "$TMPD/$FILE"
    [ "$(sha256 "$TMPD/$FILE")" = "$(grep " $FILE\$" "$TMPD/SHASUMS256.txt" | cut -d' ' -f1)" ] || die "checksum Node tidak cocok"
    rm -rf "$TOOLS/node" && mkdir -p "$TOOLS/node" && tar -xJf "$TMPD/$FILE" -C "$TOOLS/node" --strip-components=1
    for b in node npm npx; do ln -sf "$TOOLS/node/bin/$b" "$TB/$b"; done
  }
fi
node_ok || die "Node.js >= 20 belum tersedia"
ok "node $(node --version)"

# ffmpeg + ffprobe dengan libx264
ff_ok() { has ffmpeg && has ffprobe && ffmpeg -hide_banner -encoders 2>/dev/null | grep libx264 >/dev/null; }
if ! ff_ok; then
  brew_install ffmpeg || apt_install ffmpeg || {
    if [ "$OS" = Linux ]; then
      info "mengunduh ffmpeg statis (github.com/BtbN/FFmpeg-Builds, GPL + libx264)"
      BA=$([ "$ARCH" = x64 ] && echo linux64 || echo linuxarm64)
      F="ffmpeg-master-latest-$BA-gpl.tar.xz"
      REL="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest"
      fetch "$REL/checksums.sha256" "$TMPD/ff.sha256"
      fetch "$REL/$F" "$TMPD/$F"
      [ "$(sha256 "$TMPD/$F")" = "$(grep " $F\$" "$TMPD/ff.sha256" | cut -d' ' -f1)" ] || die "checksum ffmpeg tidak cocok"
      tar -xJf "$TMPD/$F" -C "$TMPD" && cp "$TMPD/${F%.tar.xz}/bin/ffmpeg" "$TMPD/${F%.tar.xz}/bin/ffprobe" "$TB/"
    else
      die "pasang Homebrew dulu (https://brew.sh), lalu jalankan ulang skrip ini; ffmpeg akan dipasang otomatis"
    fi
  }
fi
ff_ok || die "ffmpeg dengan libx264 belum tersedia"
ok "ffmpeg $(ffmpeg -version | sed -n 1p | cut -d' ' -f3)"

# uv (mengelola Python 3.12 sendiri, tidak memakai Python sistem)
if ! has uv; then
  brew_install uv || { info "memasang uv (astral.sh)"; curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR="$TB" INSTALLER_NO_MODIFY_PATH=1 UV_NO_MODIFY_PATH=1 sh >/dev/null; }
fi
has uv || die "uv belum tersedia"
ok "uv $(uv --version | cut -d' ' -f2)"

# rclone (unggah Google Drive)
if ! has rclone; then
  brew_install rclone || {
    ROS=$([ "$OS" = Darwin ] && echo osx || echo linux)
    info "mengunduh rclone (downloads.rclone.org)"
    fetch "https://downloads.rclone.org/rclone-current-$ROS-$ARCH2.zip" "$TMPD/rclone.zip"
    unzip -q "$TMPD/rclone.zip" -d "$TMPD/rc" && cp "$TMPD"/rc/rclone-*/rclone "$TB/" && chmod +x "$TB/rclone"
  } || info "rclone gagal dipasang (opsional, hanya untuk Google Drive)"
fi
has rclone && ok "rclone $(rclone version | sed -n 1p | cut -d' ' -f2)"

say "2/8 Workspace: $WS"
mkdir -p "$WS"/{Projects,Brands,References,Result,Styles}
copy_once() { [ -e "$WS/$1" ] || { mkdir -p "$(dirname "$WS/$1")"; cp "$PLUGIN_ROOT/template/$1" "$WS/$1"; ok "dibuat $1"; }; }
for f in CLAUDE.md .gitignore Projects/README.md Brands/README.md Brands/_selera.md References/README.md Result/README.md Styles/README.md; do copy_once "$f"; done

say "3/8 Mesin -> $WS/Engine (data workspace tidak disentuh)"
node "$PLUGIN_ROOT/bin/sync-engine.mjs" "$PLUGIN_ROOT/engine" "$WS/Engine"
[ -e "$WS/Engine/config.local.json" ] || printf '{\n  "elevenlabs": { "voice": "George", "voices": {} },\n  "drive": { "remote": "gdrive", "rootFolderId": "", "rootName": "" }\n}\n' > "$WS/Engine/config.local.json"
ok "mesin versi $(node -p "require('$PLUGIN_ROOT/.claude-plugin/plugin.json').version")"

cd "$WS/Engine"
say "4/8 Dependensi Node (npm ci)"
LOCKHASH="$(sha256 package-lock.json)"
if [ -d node_modules ] && [ "$(cat .deps-npm 2>/dev/null)" = "$LOCKHASH" ]; then ok "sudah terpasang"; else npm ci --no-audit --no-fund --loglevel=error && echo "$LOCKHASH" > .deps-npm && ok "terpasang"; fi

say "5/8 Python 3.12 + paket analisis audio, motion graphics, HTML"
# whisper yang sudah pernah dipasang tetap dipertahankan & diperbarui
HF_HUB="${HF_HUB_CACHE:-${HF_HOME:-$HOME/.cache/huggingface}/hub}"
[ -d "$HF_HUB/models--deepdml--faster-whisper-large-v3-turbo-ct2/snapshots" ] && WITH_WHISPER=1
WH_PKG=""; [ "$WITH_WHISPER" = 1 ] && WH_PKG="faster-whisper==1.2.1"
PYREQ="v4|$WH_PKG numpy soundfile scipy librosa webrtcvad-wheels setuptools<81 playwright pillow opencv-python-headless|resemblyzer"
if [ -x .venv/bin/python ] && [ "$(cat .deps-py 2>/dev/null)" = "$PYREQ" ]; then ok "sudah terpasang"; else
  [ -x .venv/bin/python ] || uv venv .venv --python 3.12 --python-preference only-managed -q
  # Linux tanpa GPU: PyTorch versi CPU (±200 MB, bukan CUDA ±2,5 GB)
  if [ "$OS" = Linux ]; then uv pip install -q --python .venv/bin/python torch --index-url https://download.pytorch.org/whl/cpu; else uv pip install -q --python .venv/bin/python torch; fi
  # webrtcvad-wheels = webrtcvad siap pakai (tanpa compiler); resemblyzer dipasang tanpa menarik webrtcvad versi source
  # opencv-python-headless: deteksi wajah (model YuNet dibawa plugin, engine/models/) untuk mesin edit footage
  uv pip install -q --python .venv/bin/python $WH_PKG numpy soundfile scipy librosa webrtcvad-wheels "setuptools<81" playwright pillow opencv-python-headless
  uv pip install -q --python .venv/bin/python --no-deps resemblyzer
  .venv/bin/python -c "import resemblyzer, scipy, soundfile, PIL, playwright, cv2${WH_PKG:+, faster_whisper}; cv2.FaceDetectorYN" && echo "$PYREQ" > .deps-py && ok "terpasang${WH_PKG:+ (+ faster-whisper)}"
fi

say "6/8 Browser render (Chromium Playwright + Chrome Headless Remotion)"
if [ "$SKIP_BROWSERS" = 1 ]; then ok "dilewati (--skip-browsers)"; else
  if [ "$OS" = Linux ]; then
    # libatomic1 dibutuhkan Node bawaan Playwright sebelum install-deps bisa berjalan
    apt_install libatomic1 || true
    if [ "$SUDO" != NONE ]; then
      info "library sistem Chromium (playwright install-deps)"
      $SUDO "$WS/Engine/.venv/bin/python" -m playwright install-deps chromium >/dev/null 2>&1 || die "library sistem Chromium gagal dipasang: jalankan manual 'sudo $WS/Engine/.venv/bin/python -m playwright install-deps chromium' untuk melihat errornya"
    else info "! tanpa root/sudo: library sistem Chromium tidak bisa dipasang otomatis. Minta admin menjalankan: sudo apt-get install -y libatomic1 && sudo $WS/Engine/.venv/bin/python -m playwright install-deps chromium"; fi
  fi
  if .venv/bin/python -m playwright install chromium >/dev/null 2>&1; then ok "Chromium Playwright"; else
    [ "$SUDO" = NONE ] && [ "$OS" = Linux ] && info "Chromium Playwright belum bisa dipasang (butuh library sistem di atas)" || die "Chromium Playwright gagal dipasang"
  fi
  node -e "require('@remotion/renderer').ensureBrowser().then(()=>console.log('  OK    Chrome Headless Remotion'))" 2>&1 | grep -vE 'Downloading|Customize' || true
fi

say "7/8 Whisper (opsional)"
if [ "$WITH_WHISPER" = 0 ]; then ok "tidak dipasang: sinkron memakai timestamps ElevenLabs (tambahkan --with-whisper untuk QA kejelasan gratis / offline)"; else
  info "model large-v3-turbo (±1,6 GB, sekali)"
  .venv/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('deepdml/faster-whisper-large-v3-turbo-ct2', device='cpu', compute_type='int8'); print('  OK    model siap')" 2>&1 | grep -v Warning || true
fi

# alat yang dipasang ke folder pengguna harus ditemukan oleh shell & Claude Code berikutnya
mkdir -p "$CFG_DIR"
printf '# dibuat content-creator setup\nexport PATH="%s:$HOME/.local/bin:$PATH"\n' "$TB" > "$CFG_DIR/env.sh"
if [ -n "$(ls -A "$TB" 2>/dev/null)" ]; then
  for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.profile"; do
    { [ -e "$rc" ] || [ "$rc" = "$HOME/.profile" ]; } || continue
    grep -qs 'content-creator/env.sh' "$rc" || printf '\n[ -f "%s" ] && . "%s"\n' "$CFG_DIR/env.sh" "$CFG_DIR/env.sh" >> "$rc"
  done
  ok "PATH alat: $TB (ditambahkan ke profil shell)"
fi

say "8/8 Pemeriksaan"
mkdir -p "$CFG_DIR" && printf '%s\n' "$WS" > "$WS_FILE"
ok "workspace tercatat di $WS_FILE"
npm run -s check || true
cat <<EOF

Komponen terpasang. Yang tersisa hanya AKUN milik Anda (panduan lengkap: $PLUGIN_ROOT/docs/SETUP.md):
  0. Di shell yang sudah terbuka sebelum setup, muat PATH alat dulu:  . "$CFG_DIR/env.sh"
  1. ElevenLabs (wajib):     cd "$WS" && npx -y @elevenlabs/cli@latest onboard init      (login di browser)
  2. Voice default:          cd "$WS/Engine" && npm run voices   lalu isi elevenlabs.voice di config.local.json
  3. Google Drive (opsional): rclone config create gdrive drive scope=drive root_folder_id=<ID folder>
                              lalu isi drive.rootFolderId di $WS/Engine/config.local.json
  4. Uji semua jalur:        cd "$WS/Engine" && npm run selftest
Lalu buka Claude Code di mana saja dan ketik: /content-creator <ide video>
EOF
