#!/usr/bin/env bash
# Run the telemetry simulator scoped to the currently active Electron project.
# Reads the active project UUID from Electron's userData so events land in the
# correct WebSocket bucket instead of the generic "default" project.
#
# Usage:
#   npm run simulate:project
#   bash scripts/simulate-project.sh
#   SIMULATE_CYCLE_MS=1000 bash scripts/simulate-project.sh

set -euo pipefail

PROJECTS_JSON="$HOME/Library/Application Support/agent-dashboard/projects.json"

if [[ ! -f "$PROJECTS_JSON" ]]; then
  echo "Error: no projects file found at: $PROJECTS_JSON"
  echo "Open the Electron app and select a project first."
  exit 1
fi

PROJECT_ID=$(python3 -c "
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
active = data.get('activeProject')
if not active:
    sys.exit(1)
print(active['id'])
" "$PROJECTS_JSON" 2>/dev/null)

if [[ -z "$PROJECT_ID" ]]; then
  echo "Error: no active project found in the Electron app."
  echo "Open the Electron app and select a project first."
  exit 1
fi

PROJECT_NAME=$(python3 -c "
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
active = data.get('activeProject', {})
print(active.get('name', 'unknown'))
" "$PROJECTS_JSON" 2>/dev/null)

echo "Simulating for project: $PROJECT_NAME ($PROJECT_ID)"

DASHBOARD_PROJECT="$PROJECT_ID" exec node server/simulate-live.js
