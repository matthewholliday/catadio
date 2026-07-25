<div align="center">

![catadio](img/catadio_logo.png)

**Real-time observability for Cursor and Claude Code agent activity.**

</div>

![catadio dashboard](img/dashboard_screenshot.png)

Cursor and Claude Code hooks stream telemetry from the agent into a local Node.js API, and catadio renders it as a live React dashboard. Watch your agent think, edit, run shells, call MCPs, and trip guardrails, all as it happens.

> **Pre-release:** Best tested on **macOS**. Both **Cursor** and **Claude Code** are supported. Windows and Linux are not tested yet.

Available as a **web app** (browser) or **Electron desktop app** (open any Cursor or Claude Code project folder).

**License:** [MIT](LICENSE)

---

## What catadio tracks

| Metric | Visualization | Hook source |
| --- | --- | --- |
| Agent State Distribution | Donut | `afterAgentThought`, `afterFileEdit`, `afterShellExecution`, `afterMCPExecution` |
| Security Block Rate | Gauge | `beforeShellExecution`, `beforeMCPExecution` |
| Average Think Time | Line graph | `afterAgentThought` |
| Shell Success vs Failure | Stacked area | `afterShellExecution` |
| Project Blast Radius | Directory heatmap | `afterFileEdit` |
| MCP Usage Breakdown | Horizontal bar | `afterMCPExecution` |
| Commentary | AI summary panel | All hooks (Anthropic API, optional) |
| Code Churn Volume | Line graph | `afterFileEdit` |
| Autonomous Loop Duration | Scatter plot | `sessionStart` → `stop` |
| Human-in-the-Loop | Counter + sparkline | `beforeShellExecution` with `permission: ask` |

The **Hook source** column lists catadio's internal (canonical) event names. Cursor emits these names directly; Claude Code sessions feed the same metrics through a mapping layer (see [Claude Code hooks](#claude-code-hooks)). Two metrics have no Claude Code source and stay empty for Claude-only sessions: **Average Think Time** (Claude Code exposes no thinking-duration hook) and precise **Shell Success vs Failure** (Claude Code does not report a numeric exit code, so it is inferred).

---

## Quick start (web)

```bash
# Install dependencies
npm install
npm install --prefix server
npm install --prefix web

# Optional: enable AI commentary summaries
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY

# Run API + dashboard
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) for the dashboard. The API listens on [http://localhost:3847](http://localhost:3847).

## Quick start (Electron)

```bash
npm install
npm install --prefix server
npm install --prefix web

# Launch the desktop app (API + Vite + Electron)
npm run electron:dev
```

Use **Open project** to pick a workspace folder. catadio installs dashboard hooks for both agents (into `.cursor/hooks.json` and `.claude/settings.json`) and scopes telemetry to a project UUID. Hooks only fire in whichever agent you actually run, so installing both is harmless.

Package for distribution:

```bash
npm run electron:build
```

---

## Cursor hooks

Hooks are configured in `.cursor/hooks.json`. Each lifecycle event POSTs JSON to `http://localhost:3847/api/v1/telemetry` via `.cursor/hooks/dashboard_telemetry.py`.

When using the Electron app on a workspace, hook commands are rewritten with a project-scoped URL (`?project=<uuid>`). For web-only development of this repo, events go to the default project bucket.

Override the endpoint:

```bash
export DASHBOARD_URL=http://localhost:3847/api/v1/telemetry
```

### Optional: AI commentary

Commentary summaries require an Anthropic API key on the server. Copy the template and set your key:

```bash
cp .env.example .env
# ANTHROPIC_API_KEY=your-key-here
```

The summary interval is configured in the dashboard Settings UI (default 120 seconds). catadio works fully without an API key; commentary is simply disabled.

The telemetry script fails silently on network errors so hook latency never blocks your agent. Shell guardrails block `rm -rf /` and similar patterns with exit code `2`.

After editing hooks, Cursor reloads automatically. Restart Cursor if hooks do not appear in **Settings → Hooks**.

---

## Claude Code hooks

Hooks are configured in `.claude/settings.json`. Each event runs `.claude/hooks/claude_telemetry.py` (referenced via `$CLAUDE_PROJECT_DIR`), which maps Claude Code's hook events onto catadio's canonical vocabulary and POSTs to `http://localhost:3847/api/v1/telemetry`. This keeps the server, metrics engine, and dashboard identical for both agents.

Event mapping:

| Claude Code hook | catadio event | Powers |
| --- | --- | --- |
| `SessionStart` | `sessionStart` | Session start (loop duration) |
| `SessionEnd` | `stop` | Session end and duration |
| `PreToolUse` (Bash) | `beforeShellExecution` | Security gating |
| `PostToolUse` (Bash) | `afterShellExecution` | Shell outcome (exit code inferred) |
| `PostToolUse` (Edit/Write/MultiEdit/NotebookEdit) | `afterFileEdit` | Code churn, blast radius |
| `PreToolUse` / `PostToolUse` (`mcp__*`) | `beforeMCPExecution` / `afterMCPExecution` | MCP usage and blocking |
| `Notification` (permission prompt) | `notification` | Human-in-the-loop count |

Known limitations for Claude Code sessions:

- **No think-time metric.** Claude Code has no thinking-duration hook, so the Average Think Time chart and the "Thinking" donut slice stay empty.
- **Approximate shell success.** Claude Code does not expose a numeric Bash exit code; catadio infers success/failure from the tool result, defaulting to success.
- **No model label.** Claude Code hook payloads carry no model field, so events show no model.

Shell guardrails match the Cursor script: `rm -rf /` and similar patterns are blocked with exit code `2`, which Claude Code treats as denying the tool call. The `DASHBOARD_URL` override applies to both agents:

```bash
export DASHBOARD_URL=http://localhost:3847/api/v1/telemetry
```

After editing `.claude/settings.json`, start a new Claude Code session so the hooks load.

---

## Development

Stream fake telemetry to exercise every panel without running an agent:

```bash
npm run simulate
```

Load a one-shot demo snapshot:

```bash
npm run seed
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for data flow, API routes, and extension points. See [AGENTS.md](AGENTS.md) for conventions when contributing with AI tools.

## Architecture

```
Cursor / Claude Code hooks (stdin JSON)
        │
        ▼
telemetry script  ──POST──▶  Express API (/api/v1/telemetry)
(.cursor or .claude)             │
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
| `npm run simulate` | Stream continuous fake telemetry |
| `npm run build` | Production build of the web UI |

---

## Security

catadio is a **local-first** tool. Do not expose port 3847 to untrusted networks without adding authentication.

- Copy `.env.example` to `.env` for secrets; never commit `.env`
- Report vulnerabilities per [SECURITY.md](SECURITY.md)

## Production notes

catadio uses an in-memory store (last 5,000 events per project). For team-wide telemetry, point `DASHBOARD_URL` at a persistent backend or extend `server/store.js` with Redis/Postgres.

## Documentation

| File | Purpose |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, data flow, API reference |
| [AGENTS.md](AGENTS.md) | Guidance for AI coding agents |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting and security practices |
| [web/src/DESIGN.md](web/src/DESIGN.md) | Frontend UI conventions |
