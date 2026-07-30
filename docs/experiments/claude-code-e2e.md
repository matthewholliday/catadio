# Experiment: catadio end-to-end against a real Claude Code session

**Goal:** verify that catadio observes a **real** Claude Code session end to end —
hooks fire, the producer script normalizes events, the server ingests them, the
metrics engine derives the dashboard panels, and the WebSocket pushes live
updates. Mocking was explicitly a non-goal: a genuine, authenticated `claude`
session drove the whole pipeline.

Reproduce with [`scripts/e2e-claude-session.sh`](../../scripts/e2e-claude-session.sh).

## Setup

- Real catadio API server (`node server/index.js`) on `:3847`.
- A throwaway sandbox project with catadio's shipped `.claude/` hooks
  (`settings.json` + `claude_telemetry.py`) copied in **verbatim**. The only
  addition was a `permissions.allow` list so a headless session runs tools
  without interactive prompts — the hooks themselves were unchanged.
- A real headless session: `claude -p "<5 steps>" --allowedTools "Bash Edit Write Read"`.
- `claude` CLI `2.1.220`, Python `3.11`, Node `22`.

The session was instructed to: Write `greeting.py`, run it via Bash, Edit it to
add a line, run it again, then `echo done`.

## Result: PASS

The session completed with `is_error: false`, `num_turns: 6`, and **0 permission
denials**. catadio captured the full canonical event stream for the session:

| Order | Canonical event | Detail captured |
| --- | --- | --- |
| 1 | `sessionStart` | `startup`, cwd of the sandbox |
| 2 | `afterFileEdit` | `greeting.py` `+1 -0` (the Write) |
| 3 | `beforeShellExecution` | `python3 greeting.py` (ALLOWED) |
| 4 | `afterShellExecution` | `python3 greeting.py` `exit=0` |
| 5 | `afterFileEdit` | `greeting.py` `+2 -1` (the Edit) |
| 6 | `beforeShellExecution` | `python3 greeting.py` |
| 7 | `afterShellExecution` | `python3 greeting.py` `exit=0` |
| 8 | `beforeShellExecution` | `echo done` |
| 9 | `afterShellExecution` | `echo done` `exit=0` |
| 10 | `stop` | `19s` session duration |

Derived metrics matched the activity exactly:

- **Agent State Distribution:** 2 edits, 4 shell executions.
- **Shell Outcome:** 3+ successes, 0 failures (exit code inferred, all `exit=0`).
- **Code Churn:** `+3 / -1`, net `+2`.
- **Blast Radius:** the sandbox project directory, 2 edits.
- **Session Duration scatter:** one paired `sessionStart → stop` point (~0.3 min).
- **Think Time / MCP Usage:** empty — expected, since Claude Code exposes no
  thinking-duration hook and the run made no MCP calls (documented limitations).

The catadio server log stayed clean and the session's hook stderr was empty —
the telemetry hook never added visible latency or blocked the agent.

## Guardrail (security block) path — PASS

Driving the real `claude_telemetry.py` hook with the authentic Claude Code
`PreToolUse` payload for a blocked command (`rm -rf /…`) returned **exit code 2**
(which Claude Code treats as "deny the tool call") and recorded a `DENIED`
`beforeShellExecution` event, moving the **Security Block Rate** panel off zero.

An unplanned but telling confirmation: because this repo itself ships the hooks,
a verification command whose text contained the blocked pattern was itself
denied by catadio mid-experiment — a live guardrail interception of a real
Claude Code agent, not a synthetic one.

## WebSocket live-push — PASS

A WebSocket client on `ws://localhost:3847/ws?project=default` received the
dashboard's real update sequence on each ingested event:
`metrics` (on connect) → `event` → `metrics` (recomputed) — the exact stream the
React dashboard's `useMetrics.js` consumes.

## Conclusion

catadio works end to end against a real Claude Code session: shipped hooks →
producer normalization → server ingest → metrics derivation → live WebSocket
push, including the security guardrail deny path. No mocking was used anywhere in
the verified path.
