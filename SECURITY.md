# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x | Yes |

## Reporting a vulnerability

If you discover a security issue, please report it responsibly rather than opening a public GitHub issue.

**Email:** matthewjacobholliday@gmail.com

Include:

- A description of the vulnerability and its impact
- Steps to reproduce
- Affected version or commit hash, if known
- Any suggested fix, if you have one

I aim to acknowledge reports within 72 hours and will work with you on a fix and disclosure timeline.

## Scope

This project is a **local-first** observability tool. It runs an Express API and WebSocket server on your machine (default port 3847) and receives telemetry from Cursor hooks. It is not designed for exposure to the public internet.

In scope:

- The Node.js API server (`server/`)
- The telemetry hook script (`.cursor/hooks/dashboard_telemetry.py`)
- The Electron desktop shell (`electron/`)
- The React dashboard (`web/`)

Out of scope:

- Vulnerabilities in Cursor itself
- Issues that require physical access to an unlocked machine
- Misconfigurations from binding the API to a public interface without authentication

## Security practices for users

1. **Keep secrets out of git.** Copy `.env.example` to `.env` for local API keys. Never commit `.env`.
2. **Run locally only.** Do not expose port 3847 to untrusted networks without adding authentication and TLS.
3. **Review hook policies.** The bundled telemetry script includes basic shell guardrails (`rm -rf /`, etc.). Customize `dashboard_telemetry.py` for your organization's policies.
4. **Rotate keys if leaked.** If an `ANTHROPIC_API_KEY` or other credential is ever committed, rotate it immediately and purge it from git history.

## Known limitations

- Telemetry is stored in memory (last 5,000 events per project). There is no encryption at rest.
- The API has no built-in authentication. Anyone who can reach the port can POST telemetry or read metrics.
- Commentary summaries send aggregated event descriptions to the Anthropic API when `ANTHROPIC_API_KEY` is set.
