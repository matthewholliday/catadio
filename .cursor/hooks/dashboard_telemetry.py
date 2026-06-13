#!/usr/bin/env python3
"""Stream Cursor hook payloads to the local agent dashboard."""

import json
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Optional, Tuple

DASHBOARD_URL = os.environ.get(
    "DASHBOARD_URL", "http://localhost:3847/api/v1/telemetry"
)

BLOCKED_SHELL_PATTERNS = (
    "rm -rf /",
    "env | curl",
    ":(){ :|:& };:",
)

BLOCKED_MCP_SERVERS = (
    "unauthorized-internal-tool",
)

FILE_EDIT_HOOKS = frozenset({"afterFileEdit", "afterTabFileEdit"})
FILE_WRITE_TOOLS = frozenset({"Write", "StrReplace", "ApplyPatch", "EditNotebook"})


def log_to_dashboard(payload: dict) -> None:
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


def extract_command(input_data: dict) -> str:
    return (
        input_data.get("command")
        or input_data.get("text")
        or input_data.get("full_command")
        or ""
    )


def read_hook_input() -> Tuple[dict, Optional[str]]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}, "empty stdin"
    try:
        return json.loads(raw), None
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


def enrich_file_edit_payload(input_data: dict) -> dict:
    enriched = dict(input_data)
    edits = enriched.get("edits")
    if isinstance(edits, list):
        enriched["edits"] = [enrich_edit(ed) if isinstance(ed, dict) else ed for ed in edits]
        return enriched

    if enriched.get("lines_added") is None and enriched.get("added") is None:
        old_str = enriched.get("old_string") or enriched.get("oldString") or ""
        new_str = enriched.get("new_string") or enriched.get("newString") or ""
        if old_str or new_str:
            enriched["lines_added"] = count_lines(new_str)
            enriched["lines_removed"] = count_lines(old_str)

    return enriched


def file_edit_from_post_tool_use(input_data: dict) -> Optional[dict]:
    tool_name = input_data.get("tool_name") or input_data.get("toolName") or ""
    if tool_name not in FILE_WRITE_TOOLS:
        return None

    tool_input = parse_tool_input(input_data.get("tool_input") or input_data.get("toolInput"))
    path = (
        tool_input.get("path")
        or tool_input.get("file_path")
        or tool_input.get("filePath")
        or tool_input.get("target_notebook")
        or ""
    )

    if tool_name == "Write":
        contents = tool_input.get("contents") or tool_input.get("content") or ""
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
            "tool_name": tool_name,
            "tool_use_id": input_data.get("tool_use_id") or input_data.get("toolUseId"),
        }

    if tool_name == "StrReplace":
        old_str = tool_input.get("old_string") or tool_input.get("oldString") or ""
        new_str = tool_input.get("new_string") or tool_input.get("newString") or ""
        return {
            "file_path": path,
            "edits": [
                enrich_edit(
                    {
                        "old_string": old_str,
                        "new_string": new_str,
                    }
                )
            ],
            "tool_name": tool_name,
            "tool_use_id": input_data.get("tool_use_id") or input_data.get("toolUseId"),
        }

    if tool_name == "ApplyPatch":
        patch = tool_input.get("patch") or tool_input.get("contents") or ""
        added = removed = 0
        if isinstance(patch, str):
            for line in patch.splitlines():
                if line.startswith("+") and not line.startswith("+++"):
                    added += 1
                elif line.startswith("-") and not line.startswith("---"):
                    removed += 1
        return {
            "file_path": path,
            "edits": [{"lines_added": added, "lines_removed": removed}],
            "tool_name": tool_name,
            "tool_use_id": input_data.get("tool_use_id") or input_data.get("toolUseId"),
        }

    return None


def audit_file_edit(hook_name: str, input_data: dict, parse_error: Optional[str]) -> None:
    if hook_name not in FILE_EDIT_HOOKS and hook_name != "postToolUse":
        return

    audit_path = os.path.join(os.path.dirname(__file__), "last-edit-audit.json")
    edits = input_data.get("edits") if isinstance(input_data.get("edits"), list) else []
    first_edit = edits[0] if edits and isinstance(edits[0], dict) else {}
    audit = {
        "timestamp": time.time(),
        "hook_name": hook_name,
        "parse_error": parse_error,
        "context_keys": sorted(input_data.keys()),
        "file_path": input_data.get("file_path"),
        "tool_name": input_data.get("tool_name"),
        "edits_count": len(edits),
        "edit_keys": sorted(first_edit.keys()),
        "has_old_string": bool(first_edit.get("old_string") or first_edit.get("oldString")),
        "has_new_string": bool(first_edit.get("new_string") or first_edit.get("newString")),
        "old_string_len": len(first_edit.get("old_string") or first_edit.get("oldString") or ""),
        "new_string_len": len(first_edit.get("new_string") or first_edit.get("newString") or ""),
        "lines_added": first_edit.get("lines_added") or first_edit.get("added"),
        "lines_removed": first_edit.get("lines_removed") or first_edit.get("removed"),
    }
    try:
        with open(audit_path, "w", encoding="utf-8") as fh:
            json.dump(audit, fh, indent=2)
    except Exception:
        pass


def main() -> None:
    hook_name = sys.argv[1] if len(sys.argv) > 1 else "unknown"
    input_data, parse_error = read_hook_input()

    if hook_name in FILE_EDIT_HOOKS:
        input_data = enrich_file_edit_payload(input_data)
    elif hook_name == "postToolUse":
        converted = file_edit_from_post_tool_use(input_data)
        if converted:
            input_data = {**input_data, **converted}

    audit_file_edit(hook_name, input_data, parse_error)

    telemetry_payload = {
        "hook_event": hook_name,
        "timestamp": time.time(),
        "conversation_id": input_data.get("conversation_id"),
        "generation_id": input_data.get("generation_id"),
        "model": input_data.get("model"),
        "context_details": input_data,
    }

    if parse_error:
        telemetry_payload["context_details"] = {
            **input_data,
            "_telemetry_parse_error": parse_error,
        }

    if hook_name == "beforeShellExecution":
        command_text = extract_command(input_data)
        for pattern in BLOCKED_SHELL_PATTERNS:
            if pattern in command_text:
                telemetry_payload["policy_verdict"] = "DENIED"
                log_to_dashboard(telemetry_payload)
                sys.stderr.write(
                    f"Security intercept: blocked potentially malicious behavior: {command_text}\n"
                )
                sys.exit(2)

        permission = input_data.get("permission")
        if permission in ("ask", "ASK"):
            telemetry_payload["policy_verdict"] = "ASK"
            log_to_dashboard(telemetry_payload)
            sys.exit(0)

    elif hook_name == "beforeMCPExecution":
        server = (
            input_data.get("metadata", {}).get("server")
            or input_data.get("server")
            or ""
        )
        for blocked in BLOCKED_MCP_SERVERS:
            if blocked in server:
                telemetry_payload["policy_verdict"] = "DENIED"
                log_to_dashboard(telemetry_payload)
                sys.exit(2)

    telemetry_payload["policy_verdict"] = telemetry_payload.get("policy_verdict", "ALLOWED")
    log_to_dashboard(telemetry_payload)
    sys.exit(0)


if __name__ == "__main__":
    main()
