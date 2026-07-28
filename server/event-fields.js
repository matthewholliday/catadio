/**
 * Field extraction for canonical telemetry events.
 *
 * Every agent's producer script emits the same canonical `hook_event` names, but
 * the `context_details` blob underneath is shaped by whatever the agent's native
 * hook handed over. Cursor nests a file edit as `edits: [{ path, lines_added }]`;
 * Claude Code puts the path at the top level as `file_path` and describes the
 * change with `old_string`/`new_string`. These helpers read a field out of an
 * event whichever producer wrote it, so metrics and the event feed never have to
 * know which agent an event came from.
 */

export function countLines(text) {
  if (text == null || text === '') return 0;
  const normalized = String(text).replace(/\r\n/g, '\n');
  const parts = normalized.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts.length;
}

export function truncateStr(value, max = 120) {
  const s = String(value ?? '');
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

export function parseToolInput(toolInput) {
  if (toolInput && typeof toolInput === 'object') return toolInput;
  if (typeof toolInput === 'string' && toolInput.trim()) {
    try {
      const parsed = JSON.parse(toolInput);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // ignore malformed tool_input payloads
    }
  }
  return {};
}

export function extractEditedPaths(event) {
  const ctx = event.context_details ?? {};
  if (Array.isArray(ctx.files)) return ctx.files.map(String);
  if (Array.isArray(ctx.edits)) {
    const paths = ctx.edits
      .map((ed) => ed.path ?? ed.file ?? ed.filename ?? ed.file_path)
      .filter(Boolean);
    if (paths.length) return paths;
  }
  // Claude Code carries one path per event, above the edit list.
  if (ctx.file_path) return [ctx.file_path];
  if (ctx.path) return [ctx.path];
  if (ctx.file) return [ctx.file];
  return ['unknown'];
}

export function extractDurationMs(event) {
  const ctx = event.context_details ?? {};
  return (
    ctx.duration_ms ??
    ctx.thinking_duration_ms ??
    ctx.duration ??
    ctx.elapsed_ms ??
    null
  );
}

export function extractShellCommand(ctx) {
  return ctx.command ?? ctx.text ?? '';
}

export function extractExitCode(ctx) {
  return ctx.exit_code ?? ctx.exitCode ?? null;
}

/** MCP server, plus the specific tool when the producer recorded one. */
export function extractMcpTarget(ctx) {
  const server = ctx.metadata?.server ?? ctx.server ?? ctx.tool_name ?? ctx.toolName;
  if (!server) return '';
  const tool = ctx.mcp_tool ?? ctx.metadata?.tool;
  return tool ? `${server}.${tool}` : String(server);
}

export function extractToolName(ctx) {
  return ctx.tool_name ?? ctx.toolName ?? '';
}

function extractEditLineDeltas(edit) {
  if (
    edit.lines_added != null ||
    edit.added != null ||
    edit.lines_removed != null ||
    edit.removed != null
  ) {
    return {
      added: edit.lines_added ?? edit.added ?? 0,
      removed: edit.lines_removed ?? edit.removed ?? 0,
    };
  }

  const oldStr = edit.old_string ?? edit.oldString ?? '';
  const newStr = edit.new_string ?? edit.newString ?? '';
  if (oldStr !== '' || newStr !== '') {
    return { added: countLines(newStr), removed: countLines(oldStr) };
  }

  return { added: 0, removed: 0 };
}

function extractPostToolUseLineDeltas(ctx) {
  const toolName = extractToolName(ctx);
  const toolInput = parseToolInput(ctx.tool_input ?? ctx.toolInput);

  if (toolName === 'Write') {
    const contents = toolInput.contents ?? toolInput.content ?? '';
    return { added: countLines(contents), removed: 0 };
  }

  if (toolName === 'StrReplace') {
    const oldStr = toolInput.old_string ?? toolInput.oldString ?? '';
    const newStr = toolInput.new_string ?? toolInput.newString ?? '';
    return { added: countLines(newStr), removed: countLines(oldStr) };
  }

  if (toolName === 'ApplyPatch') {
    const patch = toolInput.patch ?? toolInput.contents ?? '';
    if (typeof patch !== 'string') return { added: 0, removed: 0 };
    let added = 0;
    let removed = 0;
    for (const line of patch.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) added++;
      else if (line.startsWith('-') && !line.startsWith('---')) removed++;
    }
    return { added, removed };
  }

  return { added: 0, removed: 0 };
}

export function extractEventLineDeltas(event) {
  const ctx = event.context_details ?? {};

  if (Array.isArray(ctx.edits)) {
    let added = 0;
    let removed = 0;
    for (const ed of ctx.edits) {
      const deltas = extractEditLineDeltas(ed);
      added += deltas.added;
      removed += deltas.removed;
    }
    if (added > 0 || removed > 0) {
      return { added, removed };
    }
  }

  if (
    ctx.lines_added != null ||
    ctx.added != null ||
    ctx.lines_removed != null ||
    ctx.removed != null
  ) {
    return {
      added: ctx.lines_added ?? ctx.added ?? 0,
      removed: ctx.lines_removed ?? ctx.removed ?? 0,
    };
  }

  const oldStr = ctx.old_string ?? ctx.oldString ?? '';
  const newStr = ctx.new_string ?? ctx.newString ?? '';
  if (oldStr !== '' || newStr !== '') {
    return { added: countLines(newStr), removed: countLines(oldStr) };
  }

  if (event.hook_event === 'postToolUse') {
    return extractPostToolUseLineDeltas(ctx);
  }

  return { added: 0, removed: 0 };
}

/**
 * One-line human summary of what an event did, for the dashboard's event feed
 * and the commentary prompt. Returns '' only when the event genuinely carries
 * nothing beyond its name.
 */
export function extractEventDetail(event) {
  const ctx = event.context_details ?? {};
  const parts = [];

  switch (event.hook_event) {
    case 'sessionStart': {
      if (ctx.source) parts.push(String(ctx.source));
      if (ctx.cwd) parts.push(truncateStr(ctx.cwd, 80));
      break;
    }

    case 'stop': {
      if (event.session_duration_sec != null) {
        parts.push(`${Math.round(event.session_duration_sec)}s`);
      }
      if (ctx.reason) parts.push(String(ctx.reason));
      break;
    }

    case 'beforeShellExecution':
    case 'afterShellExecution': {
      const cmd = extractShellCommand(ctx);
      if (cmd) parts.push(truncateStr(cmd, 100));
      if (event.hook_event === 'afterShellExecution') {
        const code = extractExitCode(ctx);
        if (code != null) parts.push(`exit=${code}`);
      }
      break;
    }

    case 'afterFileEdit':
    case 'afterTabFileEdit': {
      const paths = extractEditedPaths(event).filter((p) => p !== 'unknown');
      if (paths.length) parts.push(truncateStr(paths.join(', '), 100));
      const { added, removed } = extractEventLineDeltas(event);
      if (added || removed) parts.push(`+${added} -${removed}`);
      break;
    }

    case 'beforeMCPExecution':
    case 'afterMCPExecution': {
      const target = extractMcpTarget(ctx);
      if (target) parts.push(truncateStr(target, 60));
      break;
    }

    case 'postToolUse': {
      const tool = extractToolName(ctx);
      if (tool) parts.push(String(tool));
      const paths = extractEditedPaths(event).filter((p) => p !== 'unknown');
      if (paths.length) parts.push(truncateStr(paths.join(', '), 80));
      break;
    }

    case 'afterAgentThought': {
      const ms = extractDurationMs(event);
      if (ms != null) parts.push(`${ms}ms`);
      break;
    }

    case 'notification': {
      const message = ctx.user_message ?? ctx.message;
      if (message) parts.push(truncateStr(message, 100));
      else if (ctx.permission) parts.push(`permission: ${ctx.permission}`);
      break;
    }

    default:
      break;
  }

  return parts.join('  ');
}
