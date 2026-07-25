# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project summary

Local real-time dashboard for Cursor and Claude Code agent telemetry. Per-agent hook scripts normalize events into one canonical vocabulary and POST JSON to a Node.js API; React visualizes metrics over WebSocket. Optional Electron wrapper manages multi-project hook installation for both agents.

## Repository layout

```
agent-dashboard/
├── .cursor/hooks/          # Cursor telemetry hook script (shipped with Electron)
├── .cursor/hooks.json      # Cursor hook config template (no project UUID; Electron scopes per workspace)
├── .claude/hooks/          # Claude Code telemetry hook script (shipped with Electron)
├── .claude/settings.json   # Claude Code hook config (uses $CLAUDE_PROJECT_DIR; Electron scopes per workspace)
├── server/                 # Express API, metrics engine, store
├── web/src/                # React dashboard (Vite + Tailwind + Recharts)
├── electron/               # Desktop shell, project picker, hook installer
├── scripts/                # Shell helpers for dev and simulation
├── .env.example            # Environment variable template (copy to .env)
└── ARCHITECTURE.md         # Detailed system design
```

## Conventions

- **ES modules** in `server/` (`"type": "module"` in root `package.json`)
- **CommonJS** in `electron/` (Electron main process)
- **React 19 + Vite** in `web/`
- Match existing naming: camelCase in JS, snake_case in telemetry payloads (`hook_event`, `context_details`, `policy_verdict`)
- UI styling: follow `web/src/DESIGN.md` border-radius tiers
- Keep changes minimal and focused; reuse existing abstractions in `store.js`, `metrics.js`, and `Charts.jsx`

## Environment and secrets

- Never commit `.env` or real API keys
- `ANTHROPIC_API_KEY` is optional; commentary is disabled without it
- `.cursor/hooks/last-edit-audit.json` is a runtime debug artifact (gitignored)

## Common tasks

| Task | Where to work |
| --- | --- |
| New metric panel | `server/metrics.js` → `web/src/components/Charts.jsx` → `web/src/App.jsx` |
| Cursor hook behavior / guardrails | `.cursor/hooks/dashboard_telemetry.py` |
| Claude Code hook behavior / guardrails | `.claude/hooks/claude_telemetry.py` (maps Claude Code events to the canonical vocabulary) |
| Support a new agent | Add a producer script mapping its hooks to the canonical events; reuse `.claude/hooks/claude_telemetry.py` as the model |
| API routes | `server/index.js` |
| WebSocket protocol | `server/index.js`, `web/src/useMetrics.js` |
| Electron project flow | `electron/main.js`, `web/src/components/ProjectBar.jsx` |
| Demo / test data | `server/seed-demo.js`, `server/simulate-live.js` |

## Running locally

```bash
npm install && npm install --prefix server && npm install --prefix web
cp .env.example .env   # optional, for commentary
npm run dev            # API :3847 + UI :5173
npm run simulate       # fake telemetry stream (separate terminal)
```

## Testing changes

- No automated test suite yet; verify manually with `npm run dev` and `npm run simulate`
- After Cursor hook changes, restart Cursor or reload hooks in Settings; after Claude Code hook changes, start a new Claude Code session
- The Claude Code producer reads argv + stdin, so you can test it directly: `echo '<hook-json>' | DASHBOARD_URL=... python3 .claude/hooks/claude_telemetry.py <EventName>`
- After metrics changes, confirm WebSocket panels update live during simulation

## Do not

- Add authentication bypasses or disable hook guardrails without explicit request
- Hardcode local filesystem paths (`/Users/...`); use `process.cwd()`, env vars, or Electron-provided paths
- Track runtime artifacts (audit logs, `.env`, `node_modules/`, `dist/`) in git
- Use em-dashes in user-facing prose
