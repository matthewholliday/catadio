# Cursor Hooks Agent Dashboard

Real-time observability dashboard for Cursor agent activity, powered by project hooks that stream telemetry from the IDE into a local Node.js API and React UI.

Available as a **web app** (browser) or **Electron desktop app** (open any Cursor project folder).

## What's included

| Metric | Visualization | Hook source |
| --- | --- | --- |
| Agent State Distribution | Donut | `afterAgentThought`, `afterFileEdit`, `afterShellExecution`, `afterMCPExecution` |
| Security Block Rate | Gauge | `beforeShellExecution`, `beforeMCPExecution` |
| Average Think Time | Line graph | `afterAgentThought` |
| Shell Success vs Failure | Stacked area | `afterShellExecution` |
| Project Blast Radius | Directory heatmap | `afterFileEdit` |
| MCP Usage Breakdown | Horizontal bar | `afterMCPExecution` |
| Commentary | AI summary panel | All hooks (Anthropic API) |
| Code Churn Volume | Line graph | `afterFileEdit` |
| Autonomous Loop Duration | Scatter plot | `sessionStart` → `stop` |
| Human-in-the-Loop | Counter + sparkline | `beforeShellExecution` with `permission: ask` |

## Quick start (web)

```bash
# Install dependencies
npm install
npm install --prefix server
npm install --prefix web

# Run API + dashboard (two processes)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) for the dashboard. The API listens on [http://localhost:3847](http://localhost:3847).

## Quick start (Electron)

```bash
npm install
npm install --prefix server
npm install --prefix web

# Launch desktop app (API + Vite + Electron)
npm run electron:dev
```

Use **Open project** to pick a Cursor workspace folder. The app installs dashboard hooks into `.cursor/hooks.json` and scopes telemetry to that project.

Package for distribution:

```bash
npm run electron:build
```

Seed demo data (optional, with the server already running):

```bash
npm run seed
```

## Cursor hooks

Hooks are configured in `.cursor/hooks.json`. Each lifecycle event POSTs JSON to `http://localhost:3847/api/v1/telemetry` via `.cursor/hooks/dashboard_telemetry.py`.

Override the endpoint:

```bash
export DASHBOARD_URL=http://localhost:3847/api/v1/telemetry
```

Commentary summaries require an Anthropic API key on the server. Set it in a `.env` file at the project root:

```bash
# .env
ANTHROPIC_API_KEY=your-key-here
```

Or export it in your shell before starting the server:

```bash
export ANTHROPIC_API_KEY=your-key-here
```

The summary interval is configured in the dashboard Settings UI (default 120 seconds).

The telemetry script fails silently on network errors so hook latency never blocks your agent. Shell guardrails block `rm -rf /` and similar patterns with exit code `2`.

After editing hooks, Cursor reloads automatically. Restart Cursor if hooks do not appear in **Settings → Hooks**.

## Architecture

```
Cursor IDE hooks (stdin JSON)
        │
        ▼
dashboard_telemetry.py  ──POST──▶  Express API (/api/v1/telemetry)
                                        │
                                        ├─ in-memory event store
                                        └─ WebSocket (/ws) ──▶ React dashboard
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start API + web UI |
| `npm run dev:server` | API only (port 3847) |
| `npm run dev:web` | Vite dev server (port 5173) |
| `npm run electron:dev` | Electron app with API + Vite |
| `npm run electron:build` | Production build + package |
| `npm run electron:pack` | Unpacked Electron build |
| `npm run seed` | Populate demo telemetry |
| `npm run build` | Production build of the web UI |

## Production notes

This project uses an in-memory store (last 5,000 events). For team-wide telemetry, point `DASHBOARD_URL` at a persistent backend or extend `server/store.js` with Redis/Postgres.
