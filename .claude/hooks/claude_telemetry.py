#!/usr/bin/env python3
"""Stream Claude Code hook payloads to the local agent dashboard.

Claude Code's hook events use a different vocabulary and payload shape than
Cursor's. Rather than teach the dashboard a second event language, this script
maps Claude Code events onto the same canonical (Cursor-style) telemetry
envelope the server already understands, so the entire server + metrics + web
stack works unchanged. See .cursor/hooks/dashboard_telemetry.py for the Cursor
counterpart.

Invoked as: claude_telemetry.py <ClaudeCodeHookEventName>
Reads the hook JSON from stdin. POSTs the normalized payload to DASHBOARD_URL.
"""

import json
import os
import re
import sys
import time
import uuid
import urllib.error
import urllib.request
from typing import Optional, Tuple

DASHBOARD_URL = os.environ.get(
    "DASHBOARD_URL", "http://localhost:3847/api/v1/telemetry"
)

# Guardrails mirror the Cursor telemetry script so both agents enforce the same
# local policy. Matching commands/servers are blocked via exit code 2, which
# Claude Code treats as "deny this tool call" (stderr is fed back to Claude).
BLOCKED_SHELL_PATTERNS = (
    "rm -rf /",
    "env | curl",
    ":(){ :|:& };:",
)

BLOCKED_MCP_SERVERS = (
    "unauthorized-internal-tool",
)

FILE_WRITE_TOOLS = frozenset({"Write", "Edit", "MultiEdit", "NotebookEdit"})


def log_to_dashboard(payload: dict) -> None:
    """POST telemetry, swallowing all errors so hook latency never blocks the agent."""
    try:
        req = urllib.request.Request(
            DASHBOARD_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=1.5):
            pass
    except Exception as exc:
        sys.stderr.write(f"[Telemetry Warning] Failed to stream to dashboard: {exc}\n")


def read_hook_input() -> Tuple[dict, Optional[str]]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}, "empty stdin"
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed, None
        return {}, "stdin was not a JSON object"
    except Exception as exc:
        return {}, f"json parse failed: {exc}"


def count_lines(text) -> int:
    if text is None or text == "":
        return 0
    normalized = str(text).replace("\r\n", "\n")
    parts = normalized.split("\n")
    if parts and parts[-1] == "":
        parts.pop()
    return len(parts)


def parse_tool_input(tool_input) -> dict:
    if isinstance(tool_input, dict):
        return tool_input
    if isinstance(tool_input, str) and tool_input.strip():
        try:
            parsed = json.loads(tool_input)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
    return {}


def enrich_edit(edit: dict) -> dict:
    """Fill in lines_added/lines_removed from old/new strings when absent."""
    enriched = dict(edit)
    if (
        enriched.get("lines_added") is not None
        or enriched.get("added") is not None
        or enriched.get("lines_removed") is not None
        or enriched.get("removed") is not None
    ):
        return enriched

    old_str = enriched.get("old_string") or enriched.get("oldString") or ""
    new_str = enriched.get("new_string") or enriched.get("newString") or ""
    if old_str or new_str:
        enriched["lines_added"] = count_lines(new_str)
        enriched["lines_removed"] = count_lines(old_str)
    return enriched


def _pick(d: dict, *keys: str) -> str:
    for key in keys:
        value = d.get(key)
        if value:
            return value
    return ""


def build_file_edit(tool_name: str, tool_input) -> dict:
    """Convert a Claude Code file-editing tool call into canonical afterFileEdit ctx."""
    ti = parse_tool_input(tool_input)

    if tool_name == "Write":
        path = _pick(ti, "file_path", "filePath", "path")
        contents = ti.get("content") or ti.get("contents") or ""
        return {
            "file_path": path,
            "edits": [
                {
                    "old_string": "",
                    "new_string": contents,
                    "lines_added": count_lines(contents),
                    "lines_removed": 0,
                }
            ],
        }

    if tool_name == "Edit":
        path = _pick(ti, "file_path", "filePath", "path")
        old_str = ti.get("old_string") or ti.get("oldString") or ""
        new_str = ti.get("new_string") or ti.get("newString") or ""
        return {
            "file_path": path,
            "edits": [enrich_edit({"old_string": old_str, "new_string": new_str})],
        }

    if tool_name == "MultiEdit":
        path = _pick(ti, "file_path", "filePath", "path")
        raw_edits = ti.get("edits") if isinstance(ti.get("edits"), list) else []
        edits = []
        for ed in raw_edits:
            if isinstance(ed, dict):
                edits.append(
                    enrich_edit(
                        {
                            "old_string": ed.get("old_string") or ed.get("oldString") or "",
                            "new_string": ed.get("new_string") or ed.get("newString") or "",
                        }
                    )
                )
        if not edits:
            edits = [{"old_string": "", "new_string": "", "lines_added": 0, "lines_removed": 0}]
        return {"file_path": path, "edits": edits}

    if tool_name == "NotebookEdit":
        path = _pick(ti, "notebook_path", "file_path", "filePath", "path")
        new_src = ti.get("new_source") or ti.get("new_string") or ""
        old_src = ti.get("old_source") or ti.get("old_string") or ""
        return {
            "file_path": path,
            "edits": [enrich_edit({"old_string": old_src, "new_string": new_src})],
        }

    return {"file_path": "", "edits": []}


def parse_mcp_name(tool_name: str) -> Tuple[str, str]:
    """Split an mcp__<server>__<tool> name into (server, tool)."""
    parts = tool_name.split("__")
    server = parts[1] if len(parts) >= 2 and parts[1] else "unknown"
    tool = "__".join(parts[2:]) if len(parts) >= 3 else ""
    return server, tool


def build_mcp_context(tool_name: str) -> dict:
    server, tool = parse_mcp_name(tool_name)
    # tool_name is set to the server so computeMcpUsage buckets by server
    # (matching the existing "MCP Usage Breakdown" semantics). The specific
    # tool is preserved separately under mcp_tool.
    return {
        "server": server,
        "tool_name": server,
        "mcp_tool": tool,
        "metadata": {"server": server},
    }


def _exit_code_from_text(text) -> Optional[int]:
    if not isinstance(text, str) or not text:
        return None
    match = re.search(r"[Ee]xit code[:\s]+(-?\d+)", text)
    if match:
        return int(match.group(1))
    return None


def derive_exit_code(tool_response) -> int:
    """Best-effort Bash exit code. Claude Code does not expose a numeric code, so
    infer from explicit error flags or an "Exit code N" marker in the output,
    defaulting to 0 (success)."""
    if isinstance(tool_response, dict):
        for key in ("exit_code", "exitCode", "returncode", "code"):
            value = tool_response.get(key)
            if isinstance(value, int):
                return value
        if tool_response.get("is_error") is True or tool_response.get("isError") is True:
            return 1
        if tool_response.get("interrupted") is True:
            return 130
        text = (
            tool_response.get("stdout")
            or tool_response.get("output")
            or tool_response.get("stderr")
            or ""
        )
        parsed = _exit_code_from_text(text)
        return parsed if parsed is not None else 0

    if isinstance(tool_response, str):
        parsed = _exit_code_from_text(tool_response)
        return parsed if parsed is not None else 0

    return 0


def get_tool_response(input_data: dict):
    """Claude Code has used both tool_response and tool_result across versions."""
    if "tool_response" in input_data:
        return input_data.get("tool_response")
    return input_data.get("tool_result")


def is_permission_notification(input_data: dict) -> bool:
    """Only treat permission prompts as human interventions, not idle pings."""
    ntype = str(input_data.get("notification_type") or "").lower()
    if ntype:
        return "permission" in ntype
    message = str(input_data.get("message") or "").lower()
    return "permission" in message or "approve" in message


def emit(hook_event: str, input_data: dict, context_details: dict, verdict: str = "ALLOWED") -> None:
    payload = {
        "hook_event": hook_event,
        "agent": "claude",
        "timestamp": time.time(),
        "conversation_id": input_data.get("session_id"),
        # Claude Code has no generation id; synthesize a unique one so the
        # dashboard's per-edit churn dedup key (conversation_id + generation_id
        # + path + second) never collapses two distinct edits.
        "generation_id": str(uuid.uuid4()),
        "model": input_data.get("model"),
        "policy_verdict": verdict,
        "context_details": context_details,
    }
    log_to_dashboard(payload)


def block(hook_event: str, input_data: dict, context_details: dict, reason: str) -> None:
    """Record a DENIED event and block the tool call via exit code 2."""
    emit(hook_event, input_data, context_details, verdict="DENIED")
    sys.stderr.write(f"Security intercept: blocked potentially malicious behavior: {reason}\n")
    sys.exit(2)


def main() -> None:
    hook_name = sys.argv[1] if len(sys.argv) > 1 else "unknown"
    input_data, _parse_error = read_hook_input()
    tool_name = input_data.get("tool_name") or input_data.get("toolName") or ""

    if hook_name == "SessionStart":
        emit("sessionStart", input_data, {
            "cwd": input_data.get("cwd"),
            "source": input_data.get("source"),
        })
        sys.exit(0)

    # Claude Code fires Stop after every turn; SessionEnd fires once per session,
    # giving a single clean session-duration point (paired with sessionStart).
    if hook_name == "SessionEnd":
        emit("stop", input_data, {"reason": input_data.get("reason")})
        sys.exit(0)

    if hook_name == "Notification":
        if is_permission_notification(input_data):
            emit("notification", input_data, {
                "permission": "ask",
                "user_message": input_data.get("message"),
            }, verdict="ASK")
        sys.exit(0)

    if hook_name == "PreToolUse":
        if tool_name == "Bash":
            ti = parse_tool_input(input_data.get("tool_input") or input_data.get("toolInput"))
            command = ti.get("command") or ti.get("text") or ""
            ctx = {"command": command}
            for pattern in BLOCKED_SHELL_PATTERNS:
                if pattern in command:
                    block("beforeShellExecution", input_data, ctx, command)
            emit("beforeShellExecution", input_data, ctx)
        elif tool_name.startswith("mcp__"):
            ctx = build_mcp_context(tool_name)
            for blocked in BLOCKED_MCP_SERVERS:
                if blocked in ctx["server"]:
                    block("beforeMCPExecution", input_data, ctx, ctx["server"])
            emit("beforeMCPExecution", input_data, ctx)
        # Other tools (Read/Glob/Grep/Task/WebFetch) are not tracked.
        sys.exit(0)

    if hook_name == "PostToolUse":
        if tool_name == "Bash":
            ti = parse_tool_input(input_data.get("tool_input") or input_data.get("toolInput"))
            command = ti.get("command") or ti.get("text") or ""
            exit_code = derive_exit_code(get_tool_response(input_data))
            emit("afterShellExecution", input_data, {"command": command, "exit_code": exit_code})
        elif tool_name in FILE_WRITE_TOOLS:
            ctx = build_file_edit(tool_name, input_data.get("tool_input") or input_data.get("toolInput"))
            ctx["tool_name"] = tool_name
            emit("afterFileEdit", input_data, ctx)
        elif tool_name.startswith("mcp__"):
            emit("afterMCPExecution", input_data, build_mcp_context(tool_name))
        sys.exit(0)

    # Unmapped events (Stop, SubagentStop, PreCompact, UserPromptSubmit, ...)
    # are intentionally ignored in this version.
    sys.exit(0)


if __name__ == "__main__":
    main()
