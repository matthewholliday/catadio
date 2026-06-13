#!/usr/bin/env python3
"""Stream Cursor hook payloads to the local agent dashboard."""

import json
import os
import sys
import time
import urllib.error
import urllib.request

PROJECT_ID = os.environ.get("DASHBOARD_PROJECT_ID", "default")
DASHBOARD_URL = os.environ.get(
    "DASHBOARD_URL",
    f"http://localhost:3847/api/v1/telemetry?project={PROJECT_ID}",
)

BLOCKED_SHELL_PATTERNS = (
    "rm -rf /",
    "env | curl",
    ":(){ :|:& };:",
)

BLOCKED_MCP_SERVERS = (
    "unauthorized-internal-tool",
)


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


def main() -> None:
    hook_name = sys.argv[1] if len(sys.argv) > 1 else "unknown"

    try:
        input_data = json.load(sys.stdin)
    except Exception:
        input_data = {}

    telemetry_payload = {
        "hook_event": hook_name,
        "timestamp": time.time(),
        "conversation_id": input_data.get("conversation_id"),
        "generation_id": input_data.get("generation_id"),
        "model": input_data.get("model"),
        "project_id": PROJECT_ID,
        "context_details": input_data,
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
