#!/usr/bin/env bash
# Check for system dependencies (ffmpeg, whisper.cpp) required for recording
# ingestion + transcription. Installs missing pieces on macOS via Homebrew or
# Linux via apt/dnf. Prints install hints on other platforms rather than
# failing — the MCP server still works without these; recordings just can't be
# transcribed.
set -e

have() { command -v "$1" >/dev/null 2>&1; }

install_mac() {
  if ! have brew; then
    echo "[send2llm] Homebrew not found. Install from https://brew.sh then re-run 'npm install'."
    return 1
  fi
  local pkg="$1"
  echo "[send2llm] Installing $pkg via Homebrew..."
  brew install "$pkg"
}

install_linux() {
  local pkg="$1"
  if have apt-get; then
    echo "[send2llm] Installing $pkg via apt..."
    sudo apt-get update -y && sudo apt-get install -y "$pkg"
  elif have dnf; then
    echo "[send2llm] Installing $pkg via dnf..."
    sudo dnf install -y "$pkg"
  else
    echo "[send2llm] No supported package manager. Install '$pkg' manually."
    return 1
  fi
}

ensure() {
  local bin="$1" pkg="$2"
  if have "$bin"; then
    echo "[send2llm] OK: $bin ($($bin --version 2>&1 | head -n1))"
    return 0
  fi
  echo "[send2llm] Missing: $bin"
  case "$(uname -s)" in
    Darwin)  install_mac "$pkg"   || return 0 ;;
    Linux)   install_linux "$pkg" || return 0 ;;
    *)       echo "[send2llm] Install '$pkg' manually for your OS." ;;
  esac
}

# ffmpeg — used to normalize recordings and extract audio for transcription
ensure ffmpeg ffmpeg

# whisper.cpp — local transcription. Package name differs per platform.
case "$(uname -s)" in
  Darwin) ensure whisper-cli whisper-cpp ;;
  Linux)  # Most distros don't package whisper.cpp; suggest manual build.
    if ! have whisper-cpp && ! have whisper; then
      echo "[send2llm] whisper.cpp not found. Install from https://github.com/ggerganov/whisper.cpp"
      echo "[send2llm]   or 'pip install openai-whisper' for the Python version (slower)."
    fi
    ;;
  *) echo "[send2llm] Skipping whisper check on $(uname -s)." ;;
esac

echo "[send2llm] Dependency check complete."
