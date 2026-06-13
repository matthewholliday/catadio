#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP_NAME="Cursor Agent Dashboard"

usage() {
  cat <<EOF
Usage: $(basename "$0") [command]

Commands:
  dev     Run Electron in development mode (API + Vite + hot reload)
  build   Build a production Electron app package
  run     Build and launch the production Electron app (default)
  help    Show this help message

Examples:
  $(basename "$0")          # build and run production app
  $(basename "$0") dev        # development mode
  $(basename "$0") build      # build only
EOF
}

log() {
  printf '==> %s\n' "$*"
}

install_deps() {
  if [[ ! -d node_modules ]] || [[ ! -d server/node_modules ]] || [[ ! -d web/node_modules ]]; then
    log "Installing dependencies"
    npm install
    npm install --prefix server
    npm install --prefix web
  fi
}

run_dev() {
  install_deps
  log "Starting Electron in development mode"
  exec npm run electron:dev
}

build_app() {
  install_deps
  log "Building web UI"
  npm run build
  log "Packaging Electron app"
  npm run electron:pack
}

find_mac_app() {
  local app_path
  app_path="$(find "$ROOT/dist" -maxdepth 3 -type d -name "${APP_NAME}.app" 2>/dev/null | head -n 1 || true)"
  if [[ -z "$app_path" ]]; then
    echo "Could not find ${APP_NAME}.app under $ROOT/dist" >&2
    exit 1
  fi
  printf '%s' "$app_path"
}

find_linux_appimage() {
  local appimage_path
  appimage_path="$(find "$ROOT/dist" -maxdepth 2 -type f -name '*.AppImage' 2>/dev/null | head -n 1 || true)"
  if [[ -z "$appimage_path" ]]; then
    echo "Could not find AppImage under $ROOT/dist" >&2
    exit 1
  fi
  chmod +x "$appimage_path"
  printf '%s' "$appimage_path"
}

find_windows_exe() {
  local exe_path
  exe_path="$(find "$ROOT/dist" -maxdepth 4 -type f -name "${APP_NAME}.exe" 2>/dev/null | head -n 1 || true)"
  if [[ -z "$exe_path" ]]; then
    echo "Could not find ${APP_NAME}.exe under $ROOT/dist" >&2
    exit 1
  fi
  printf '%s' "$exe_path"
}

run_built_app() {
  case "$(uname -s)" in
    Darwin)
      local app_path
      app_path="$(find_mac_app)"
      log "Launching $app_path"
      open "$app_path"
      ;;
    Linux)
      local appimage_path
      appimage_path="$(find_linux_appimage)"
      log "Launching $appimage_path"
      exec "$appimage_path"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      local exe_path
      exe_path="$(find_windows_exe)"
      log "Launching $exe_path"
      exec "$exe_path"
      ;;
    *)
      echo "Unsupported platform for auto-launch: $(uname -s)" >&2
      echo "Built artifacts are in $ROOT/dist" >&2
      exit 1
      ;;
  esac
}

run_prod() {
  build_app
  run_built_app
}

main() {
  local command="${1:-run}"

  case "$command" in
    dev)
      run_dev
      ;;
    build)
      build_app
      log "Build complete. Artifacts are in $ROOT/dist"
      ;;
    run)
      run_prod
      ;;
    help|-h|--help)
      usage
      ;;
    *)
      echo "Unknown command: $command" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
