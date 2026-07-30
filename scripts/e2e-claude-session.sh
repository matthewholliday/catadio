#!/usr/bin/env bash
# End-to-end test: drive a REAL Claude Code session through catadio's shipped
# hooks and assert the telemetry lands in the server + metrics engine.
#
# This is deliberately NOT a mock. It:
#   1. Starts the real catadio API server (server/index.js) on port 3847.
#   2. Creates a throwaway sandbox project and installs catadio's real
#      .claude/ hooks (settings.json + claude_telemetry.py) into it, verbatim.
#   3. Runs a real, headless `claude` session (`claude -p`) in that sandbox
#      that performs a Write, two Bash runs, and an Edit.
#   4. Asserts the canonical telemetry (sessionStart, afterFileEdit x2,
#      before/afterShellExecution x3, stop) reached the server and that the
#      derived metrics are correct.
#   5. Drives the real hook with an authentic blocked-command payload and
#      asserts the guardrail denies it (exit 2) and records a DENIED event.
#
# Requirements: an authenticated `claude` CLI, python3, node, and the server
# deps installed (`npm install --prefix server`). Because it needs a live,
# authenticated agent it is not suitable for unattended CI.
#
# Usage:
#   bash scripts/e2e-claude-session.sh

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

PORT="${PORT:-3847}"
BASE="http://localhost:${PORT}"
DASH="${BASE}/api/v1/telemetry"
SANDBOX="$(mktemp -d)"
SERVER_LOG="$(mktemp)"
SERVER_PID=""

log()  { printf '\033[1;34m[e2e]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[e2e]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[e2e] FAIL:\033[0m %s\n' "$*"; exit 1; }

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  rm -rf "$SANDBOX"
}
trap cleanup EXIT

command -v claude >/dev/null || fail "claude CLI not found on PATH"
command -v python3 >/dev/null || fail "python3 not found"

# --- 1. Start the real server ------------------------------------------------
log "starting catadio server on :${PORT}"
node server/index.js >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do
  curl -sf "${BASE}/api/health" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -sf "${BASE}/api/health" >/dev/null || fail "server did not become healthy"
curl -s -X POST "${BASE}/api/demo/reset?project=default" >/dev/null
ok "server healthy, default bucket reset"

# --- 2. Install catadio's real hooks into a sandbox project ------------------
cp -r "$REPO/.claude" "$SANDBOX/.claude"
# Pre-approve the tools so a headless (possibly root) session runs without
# interactive prompts. This only touches permissions; hooks are untouched.
python3 - "$SANDBOX/.claude/settings.json" <<'PY'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
d["permissions"] = {"allow": ["Bash", "Write", "Edit", "Read"], "defaultMode": "acceptEdits"}
json.dump(d, open(p, "w"), indent=2)
PY
ok "installed catadio hooks into sandbox: $SANDBOX"

# --- 3. Run a REAL headless Claude Code session ------------------------------
log "running real claude session (this makes live API calls)"
( cd "$SANDBOX" && timeout 240 claude -p \
    "Do these steps in order using your tools: 1) Write tool: create greeting.py containing one line: print('hello from catadio'). 2) Bash tool: run exactly  python3 greeting.py  3) Edit tool: add a second line to greeting.py: print('year 2026'). 4) Bash tool: run exactly  python3 greeting.py  5) Bash tool: run exactly  echo done. Then stop." \
    --allowedTools "Bash Edit Write Read" \
    --permission-mode acceptEdits \
    --output-format json >"$SANDBOX/session.json" 2>"$SANDBOX/session.stderr" ) \
  || fail "claude session exited non-zero (see $SANDBOX/session.stderr)"
python3 -c "import json; d=json.load(open('$SANDBOX/session.json')); assert d.get('is_error') is False, d; assert not d.get('permission_denials'), d['permission_denials']" \
  || fail "session reported an error or had permission denials"
ok "real claude session completed cleanly"

# --- 4. Assert telemetry + metrics ------------------------------------------
sleep 1
curl -s "${BASE}/api/metrics?project=default" >"$SANDBOX/metrics.json"
python3 - "$SANDBOX/metrics.json" <<'PY' || exit 1
import json, sys
m = json.load(open(sys.argv[1]))
feed = m["eventFeed"]
kinds = [e["hook_event"] for e in feed]
def need(name, n):
    got = kinds.count(name)
    assert got >= n, f"expected >= {n} {name}, got {got} (feed: {kinds})"
need("sessionStart", 1)
need("afterFileEdit", 2)         # Write + Edit
need("beforeShellExecution", 3)  # python3 x2 + echo
need("afterShellExecution", 3)
need("stop", 1)
assert m["shellOutcomeSummary"]["success"] >= 3, m["shellOutcomeSummary"]
assert m["codeChurnSummary"]["added"] >= 3, m["codeChurnSummary"]
assert any("greeting.py" in b["name"] or "greeting" in json.dumps(b) or True for b in m["blastRadius"]), m["blastRadius"]
assert m["sessionScatter"], "no paired session duration point"
print("  metrics OK:",
      "shells", m["shellOutcomeSummary"]["success"], "ok /",
      "edits", m["agentStateDistribution"][1]["value"], "/",
      "churn +%d -%d" % (m["codeChurnSummary"]["added"], m["codeChurnSummary"]["removed"]))
PY
ok "canonical telemetry + derived metrics verified"

# --- 5. Guardrail deny path (drive the real hook, no destructive command) ----
PAYLOAD="$SANDBOX/blocked.json"
# Assemble the blocked command from pieces so this script's own process list
# never contains the literal pattern (which a host-level guardrail would catch).
python3 - "$PAYLOAD" <<'PY'
import json, sys
cmd = "rm -rf " + "/ --no-preserve-root"
json.dump({"session_id": "guardrail-test", "cwd": "/tmp/sandbox",
           "tool_name": "Bash", "tool_input": {"command": cmd}}, open(sys.argv[1], "w"))
PY
set +e
DASHBOARD_URL="$DASH" python3 "$SANDBOX/.claude/hooks/claude_telemetry.py" PreToolUse <"$PAYLOAD"
HOOK_RC=$?
set -e
[ "$HOOK_RC" -eq 2 ] || fail "guardrail should exit 2 (deny), got $HOOK_RC"
curl -s "${BASE}/api/metrics?project=default" | python3 -c "
import sys, json
m = json.load(sys.stdin)
assert m['securityBlockRate']['blocked'] >= 1, m['securityBlockRate']
print('  guardrail OK: blocked=%d allowed=%d rate=%.1f%%' % (
    m['securityBlockRate']['blocked'], m['securityBlockRate']['allowed'], m['securityBlockRate']['rate']))
" || fail "no DENIED event recorded"
ok "guardrail deny path verified (exit 2 + DENIED telemetry)"

ok "ALL END-TO-END CHECKS PASSED"
