# Architecture

Real-time observability for Cursor agent activity. Hooks in the IDE stream JSON telemetry to a local Node.js API; the API aggregates metrics and pushes updates to a React dashboard over WebSocket.

## System overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Cursor IDE                                                     │
│  ┌──────────────────┐    stdin JSON    ┌──────────────────────┐ │
│  │  Agent lifecycle │ ───────────────▶ │ dashboard_telemetry  │ │
│  │  (hooks.json)    │                  │ .py                  │ │
│  └──────────────────┘                  └──────────┬───────────┘ │
└───────────────────────────────────────────────────┼─────────────┘
                                                    │ POST /api/v1/telemetry
                                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Node.js API (server/)                         port 3847        │
│  ┌─────────────┐   ┌──────────────┐   ┌───────────────────────┐ │
│  │ store.js    │──▶│ metrics.js   │──▶│ WebSocket /ws         │ │
│  │ (in-memory) │   │ (aggregates) │   │ (per-project push)    │ │
│  └─────────────┘   └──────────────┘   └───────────┬───────────┘ │
│         ▲                                          │            │
│         │ optional                                 │            │
│  ┌──────┴───────┐                                  │            │
│  │commentary.js │  Anthropic API (if key set)      │            │
│  └──────────────┘                                  │            │
└───────────────────────────────────────────────────┼─────────────┘
                                                    │
                                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  React dashboard (web/)                        port 5173 (dev)  │
│  useMetrics.js ── WebSocket ──▶ Charts, gauges, event feed      │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### Telemetry hook (`.cursor/hooks/dashboard_telemetry.py`)

Python script invoked by Cursor on lifecycle events. It:

1. Reads hook context JSON from stdin
2. Enriches file-edit payloads with line counts when missing
3. Optionally blocks dangerous shell/MCP patterns (exit code 2 = deny)
4. POSTs a normalized payload to `DASHBOARD_URL` (default `http://localhost:3847/api/v1/telemetry`)
5. Writes a local debug audit file (`.cursor/hooks/last-edit-audit.json`, gitignored)

Hook events wired in `.cursor/hooks.json`:

| Hook | Purpose |
| --- | --- |
| `sessionStart` / `stop` | Session boundaries for loop-duration metrics |
| `afterAgentThought` | Think-time latency |
| `afterFileEdit` / `postToolUse` | Code churn, blast radius, tool usage |
| `beforeShellExecution` / `afterShellExecution` | Security gating, shell success/failure |
| `beforeMCPExecution` / `afterMCPExecution` | MCP usage and blocking |

### API server (`server/`)

| Module | Role |
| --- | --- |
| `index.js` | Express app, REST routes, WebSocket server |
| `store.js` | Per-project in-memory event ring buffer (5,000 events) |
| `metrics.js` | Derives dashboard metrics from raw events |
| `commentary.js` | Periodic AI summaries via Anthropic (optional) |
| `env.js` | Loads `.env` from repo root |
| `seed-demo.js` | One-shot demo data loader |
| `simulate-live.js` | Continuous fake telemetry for development |

**REST endpoints:**

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET | `/api/projects` | List known project IDs |
| GET | `/api/metrics?project=` | Snapshot metrics |
| POST | `/api/v1/telemetry?project=` | Ingest hook event |
| DELETE | `/api/projects/:id` | Clear project events |
| POST | `/api/demo/reset?project=` | Reset demo data |

**WebSocket:** `ws://localhost:3847/ws?project=<id>`

Clients receive `{ type: "metrics", data: {...} }` on connect and after each ingested event. Clients can send `{ type: "config", trendWindowMin: N }` to adjust rolling windows.

### Multi-project scoping

Each project has a UUID. Telemetry POSTs include `?project=<uuid>` so events land in the correct bucket. The Electron app generates UUIDs when you open a workspace and rewrites `.cursor/hooks.json` in that workspace with a scoped `DASHBOARD_URL`.

For local web-only development of this repo, hooks POST to the default bucket (no `project` query param).

### React dashboard (`web/`)

- **Vite + React + Tailwind + Recharts**
- `useMetrics.js`: WebSocket connection, reconnect logic, config sync
- `App.jsx`: Draggable panel grid, settings, theme/density modes
- `components/Charts.jsx`: All metric visualizations and the event feed
- `components/ProjectBar.jsx`: Electron project picker (no-op in browser)

See `web/src/DESIGN.md` for UI conventions.

### Electron shell (`electron/`)

Optional desktop wrapper that:

1. Starts the API server (production builds)
2. Opens the dashboard in a BrowserWindow
3. Lets you pick Cursor project folders
4. Installs/copies hook scripts into the target workspace
5. Scopes telemetry URLs per project UUID

Dev mode runs API + Vite separately and loads `http://localhost:5173`.

## Data flow

1. Cursor fires a hook → Python script receives JSON on stdin
2. Script POSTs `{ hook_event, timestamp, conversation_id, model, policy_verdict, context_details }` to the API
3. `store.js` appends the event, tracks session start/stop times
4. `metrics.js` recomputes aggregates (rates, distributions, time series)
5. WebSocket broadcasts updated metrics to subscribed clients
6. If commentary is enabled and the interval elapsed, `commentary.js` summarizes recent events via Anthropic

## Metrics derived from hooks

| Dashboard panel | Source hooks | Computation |
| --- | --- | --- |
| Agent State Distribution | `afterAgentThought`, `afterFileEdit`, `afterShellExecution`, `afterMCPExecution` | Event-type share over rolling window |
| Security Block Rate | `beforeShellExecution`, `beforeMCPExecution` | `DENIED` / total pre-execution events |
| Think Time | `afterAgentThought` | Average `duration_ms` over time |
| Shell Outcome | `afterShellExecution` | Exit code 0 vs non-zero over time |
| Blast Radius | `afterFileEdit`, `postToolUse` | Directory-level edit counts (treemap) |
| MCP Usage | `afterMCPExecution` | Counts by server name |
| Code Churn | `afterFileEdit`, `postToolUse` | Lines added/removed over time |
| Session Duration | `sessionStart` → `stop` | Elapsed seconds per conversation |
| Human-in-the-Loop | `beforeShellExecution` | `ASK` / `permission: ask` count |

## Deployment modes

| Mode | Command | Notes |
| --- | --- | --- |
| Web dev | `npm run dev` | API + Vite, browser at `:5173` |
| Electron dev | `npm run electron:dev` | API + Vite + Electron |
| Electron prod | `npm run electron:build` | Bundles `web/dist`, ships hooks |
| Demo data | `npm run seed` | Static snapshot |
| Live simulator | `npm run simulate` | Continuous fake events |

## Extension points

- **Persistent backend:** Replace or extend `store.js` with Redis, Postgres, or a cloud endpoint
- **Custom policies:** Edit guardrails in `dashboard_telemetry.py`
- **New metrics:** Add computation in `metrics.js`, visualization in `Charts.jsx`, panel registration in `App.jsx`
- **Remote telemetry:** Set `DASHBOARD_URL` to your hosted ingestion endpoint

## Production limitations

- In-memory store only; data is lost on restart
- No authentication on the API
- Commentary sends event summaries to Anthropic when configured

For team-wide or internet-facing deployments, add auth, persistence, and TLS before exposing the API.
