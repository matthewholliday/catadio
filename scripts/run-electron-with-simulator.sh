#!/usr/bin/env bash
# Build the web app, launch the Electron desktop app in the background, then
# start the telemetry simulator once the embedded server is ready on port 3847.
#
# The simulator runs in the foreground; Ctrl-C stops both it and Electron.
#
# Usage:
#   bash scripts/run-electron-with-simulator.sh
#   SIMULATE_CYCLE_MS=1000 bash scripts/run-electron-with-simulator.sh

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log()  { printf '\033[1;34m[electron+sim]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[electron+sim]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[electron+sim]\033[0m %s\n' "$*"; }

kill_port() {
  local port="$1"
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    warn "Killing process(es) on port $port: $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 0.3
  fi
}

kill_by_name() {
  local pattern="$1"
  local pids
  pids=$(pgrep -f "$pattern" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    warn "Killing processes matching '$pattern': $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 0.3
  fi
}

wait_for_port() {
  local port="$1"
  local max_wait="${2:-60}"
  local elapsed=0
  log "Waiting for server on port $port..."
  while ! nc -z localhost "$port" 2>/dev/null; do
    if [ "$elapsed" -ge "$max_wait" ]; then
      warn "Timed out waiting for port $port after ${max_wait}s."
      exit 1
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  ok "Server is up on port $port."
}

# ---------------------------------------------------------------------------
# Cleanup: shut down Electron when this script exits
# ---------------------------------------------------------------------------

ELECTRON_PID=""
cleanup() {
  if [ -n "$ELECTRON_PID" ] && kill -0 "$ELECTRON_PID" 2>/dev/null; then
    warn "Shutting down Electron (PID $ELECTRON_PID)..."
    kill "$ELECTRON_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# 1. Kill anything that would conflict
# ---------------------------------------------------------------------------

log "Clearing conflicting processes..."
kill_by_name "Electron.*agent-dashboard"
kill_by_name "electron.*agent-dashboard"
kill_by_name "node server/index.js"
kill_by_name "vite.*agent-dashboard"
kill_by_name "dev.*agent-dashboard"
kill_port 3847
kill_port 5173
ok "Ports 3847 and 5173 are clear."

# ---------------------------------------------------------------------------
# 2. Ensure npm dependencies are installed
# ---------------------------------------------------------------------------

if [ ! -d "$REPO/node_modules" ]; then
  log "Installing root dependencies..."
  npm install
fi

if [ ! -d "$REPO/web/node_modules" ]; then
  log "Installing web dependencies..."
  npm install --prefix web
fi

if [ ! -d "$REPO/server/node_modules" ]; then
  log "Installing server dependencies..."
  npm install --prefix server
fi

# ---------------------------------------------------------------------------
# 3. Build the web app
# ---------------------------------------------------------------------------

log "Building web app..."
npm run build
ok "Web build complete."

# ---------------------------------------------------------------------------
# 4. Launch Electron in the background
# ---------------------------------------------------------------------------

ok "Launching Agent Dashboard in background..."
ELECTRON_ENV=production node_modules/.bin/electron . &
ELECTRON_PID=$!
log "Electron started (PID $ELECTRON_PID)."

# ---------------------------------------------------------------------------
# 5. Wait for the embedded server to be ready
# ---------------------------------------------------------------------------

wait_for_port 3847 60

# ---------------------------------------------------------------------------
# 6. Start the telemetry simulator in the foreground
# ---------------------------------------------------------------------------

ok "Starting telemetry simulator (Ctrl-C to stop both)..."
exec node server/simulate-live.js
