import { describeEvent } from './commentary.js';
import { getEvents } from './store.js';

function fmtTimestamp(unixSec) {
  return new Date(unixSec * 1000).toISOString().slice(11, 19);
}

function truncateStr(value, max = 120) {
  const s = String(value ?? '');
  return s.length <= max ? s : `${s.slice(0, max)}\u2026`;
}

function extractEventDetail(event) {
  const ctx = event.context_details ?? {};
  const parts = [];

  if (event.hook_event === 'beforeShellExecution' || event.hook_event === 'afterShellExecution') {
    const cmd = ctx.command ?? ctx.text ?? '';
    if (cmd) parts.push(truncateStr(cmd, 100));
    if (event.hook_event === 'afterShellExecution') {
      const code = ctx.exit_code ?? ctx.exitCode;
      if (code != null) parts.push(`exit=${code}`);
    }
  }

  if (event.hook_event === 'afterFileEdit' || event.hook_event === 'afterTabFileEdit') {
    const files =
      ctx.files ??
      ctx.edits?.map((ed) => ed.path ?? ed.file ?? ed.file_path).filter(Boolean);
    if (files?.length) parts.push(truncateStr(files.join(', '), 100));
  }

  if (event.hook_event === 'afterMCPExecution' || event.hook_event === 'beforeMCPExecution') {
    const server = ctx.metadata?.server ?? ctx.server ?? ctx.tool_name ?? ctx.toolName;
    if (server) parts.push(truncateStr(server, 60));
  }

  if (event.hook_event === 'postToolUse') {
    const tool = ctx.tool_name ?? ctx.toolName;
    if (tool) parts.push(String(tool));
  }

  if (event.hook_event === 'afterAgentThought') {
    const ms = ctx.duration_ms ?? ctx.thinking_duration_ms ?? ctx.duration ?? ctx.elapsed_ms;
    if (ms != null) parts.push(`${ms}ms`);
  }

  if (event.hook_event === 'stop' && event.session_duration_sec != null) {
    parts.push(`${Math.round(event.session_duration_sec)}s`);
  }

  return parts.join('  ');
}

const MAX_EVENT_FEED = 100;

const STATE_HOOKS = new Set([
  'afterAgentThought',
  'afterFileEdit',
  'afterShellExecution',
  'afterMCPExecution',
]);

const STATE_LABELS = {
  afterAgentThought: 'Thinking',
  afterFileEdit: 'Editing Files',
  afterShellExecution: 'Shell Executions',
  afterMCPExecution: 'MCP Tool Calls',
};

export const DEFAULT_TREND_WINDOW_MIN = 0.5;

export function computeMetrics(projectId = 'default', options = {}) {
  const events = getEvents(projectId);
  const now = Date.now() / 1000;
  const windowSec = 3600;
  const recent = events.filter((e) => e.timestamp >= now - windowSec);
  const trendWindowMin = normalizeTrendWindowMin(options.trendWindowMin);

  const thinkTimeSeries = computeThinkTimeSeries(recent);
  const shellOutcomeSeries = computeShellOutcomes(recent);
  const codeChurnSeries = computeCodeChurn(recent);

  return {
    agentStateDistribution: computeAgentState(recent),
    securityBlockRate: computeSecurityBlockRate(recent),
    thinkTimeSeries,
    thinkTimeSummary: computeThinkTimeSummary(recent, now, trendWindowMin),
    shellOutcomeSeries,
    shellOutcomeSummary: computeShellOutcomeSummary(recent, now, trendWindowMin),
    blastRadius: computeBlastRadius(recent),
    mcpUsage: computeMcpUsage(recent),
    eventFeed: computeEventFeed(recent),
    codeChurnSeries,
    codeChurnSummary: computeCodeChurnSummary(recent, now, trendWindowMin),
    sessionScatter: computeSessionScatter(events),
    humanInterventions: computeHumanInterventions(recent),
    totals: {
      events: events.length,
      recentEvents: recent.length,
      sessions: new Set(events.map((e) => e.conversation_id).filter(Boolean)).size,
    },
    updatedAt: now,
  };
}

function computeEventFeed(events) {
  return events.slice(-MAX_EVENT_FEED).map((e) => ({
    id: e.id,
    hook_event: e.hook_event,
    time: fmtTimestamp(e.timestamp),
    timestamp: e.timestamp,
    model: e.model ?? null,
    conversation_id: e.conversation_id ?? null,
    generation_id: e.generation_id ?? null,
    policy_verdict: e.policy_verdict ?? 'ALLOWED',
    verdict: e.policy_verdict === 'DENIED' ? 'DENIED' : null,
    detail: extractEventDetail(e),
    // keep text for backward compat (AI prompt path uses it)
    text: describeEvent(e),
  }));
}

function computeAgentState(events) {
  const counts = {};
  for (const hook of STATE_HOOKS) {
    counts[STATE_LABELS[hook]] = 0;
  }

  for (const e of events) {
    if (STATE_HOOKS.has(e.hook_event)) {
      const label = STATE_LABELS[e.hook_event];
      counts[label] = (counts[label] ?? 0) + 1;
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(counts).map(([name, value]) => ({
    name,
    value,
    percent: Math.round((value / total) * 100),
  }));
}

function computeSecurityBlockRate(events) {
  const gated = events.filter((e) =>
    e.hook_event === 'beforeShellExecution' || e.hook_event === 'beforeMCPExecution'
  );
  if (gated.length === 0) {
    return { blocked: 0, allowed: 0, rate: 0 };
  }
  const blocked = gated.filter((e) => e.policy_verdict === 'DENIED').length;
  const allowed = gated.length - blocked;
  return {
    blocked,
    allowed,
    rate: Math.round((blocked / gated.length) * 1000) / 10,
  };
}

function computeThinkTimeSeries(events) {
  const buckets = bucketByMinute(events.filter((e) => e.hook_event === 'afterAgentThought'));
  return buckets.map(({ time, items }) => {
    const durations = items
      .map((e) => extractDurationMs(e))
      .filter((d) => d != null && d > 0);
    const avg = durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length / 1000
      : 0;
    return { time, avgThinkSec: Math.round(avg * 100) / 100, count: durations.length };
  });
}

function extractDurationMs(event) {
  const ctx = event.context_details ?? {};
  return (
    ctx.duration_ms ??
    ctx.thinking_duration_ms ??
    ctx.duration ??
    ctx.elapsed_ms ??
    null
  );
}

function computeShellOutcomes(events) {
  const buckets = bucketByMinute(events.filter((e) => e.hook_event === 'afterShellExecution'));
  return buckets.map(({ time, items }) => {
    let success = 0;
    let failure = 0;
    for (const e of items) {
      const code = e.context_details?.exit_code ?? e.context_details?.exitCode ?? 0;
      if (code === 0) success++;
      else failure++;
    }
    return { time, success, failure };
  });
}

function computeBlastRadius(events) {
  const dirCounts = {};
  for (const e of events.filter((ev) => ev.hook_event === 'afterFileEdit')) {
    const paths = extractEditedPaths(e);
    for (const p of paths) {
      const parts = p.split(/[/\\]/);
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
      dirCounts[dir] = (dirCounts[dir] ?? 0) + 1;
    }
  }

  return Object.entries(dirCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);
}

function extractEditedPaths(event) {
  const ctx = event.context_details ?? {};
  if (Array.isArray(ctx.files)) return ctx.files.map(String);
  if (Array.isArray(ctx.edits)) {
    const paths = ctx.edits
      .map((ed) => ed.path ?? ed.file ?? ed.filename ?? ed.file_path)
      .filter(Boolean);
    if (paths.length) return paths;
  }
  if (ctx.file_path) return [ctx.file_path];
  if (ctx.path) return [ctx.path];
  if (ctx.file) return [ctx.file];
  return ['unknown'];
}

function countLines(text) {
  if (text == null || text === '') return 0;
  const normalized = String(text).replace(/\r\n/g, '\n');
  const parts = normalized.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts.length;
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

function extractEventLineDeltas(event) {
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

function parseToolInput(toolInput) {
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

function extractPostToolUseLineDeltas(ctx) {
  const toolName = ctx.tool_name ?? ctx.toolName ?? '';
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

function isChurnEvent(event) {
  if (event.hook_event === 'afterFileEdit' || event.hook_event === 'afterTabFileEdit') {
    return true;
  }
  if (event.hook_event === 'postToolUse') {
    const toolName = event.context_details?.tool_name ?? event.context_details?.toolName ?? '';
    return ['Write', 'StrReplace', 'ApplyPatch', 'EditNotebook'].includes(toolName);
  }
  return false;
}

function churnDedupKey(event) {
  const ctx = event.context_details ?? {};
  const toolInput = parseToolInput(ctx.tool_input ?? ctx.toolInput);
  const path =
    ctx.file_path ??
    toolInput.path ??
    toolInput.file_path ??
    toolInput.filePath ??
    toolInput.target_notebook ??
    '';
  return [
    event.conversation_id ?? 'unknown',
    event.generation_id ?? 'unknown',
    path,
    Math.floor(event.timestamp),
  ].join(':');
}

function computeMcpUsage(events) {
  const counts = {};
  for (const e of events.filter((ev) => ev.hook_event === 'afterMCPExecution')) {
    const ctx = e.context_details ?? {};
    const name =
      ctx.tool_name ??
      ctx.toolName ??
      ctx.metadata?.tool ??
      ctx.metadata?.server ??
      ctx.server ??
      'unknown';
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function dedupeChurnEvents(events) {
  const churnEvents = events.filter(isChurnEvent);
  const bestByKey = new Map();

  for (const event of churnEvents) {
    const key = churnDedupKey(event);
    const deltas = extractEventLineDeltas(event);
    const total = deltas.added + deltas.removed;
    const existing = bestByKey.get(key);
    if (!existing || total > existing.total) {
      bestByKey.set(key, { event, ...deltas, total });
    }
  }

  return [...bestByKey.values()].map(({ event }) => event);
}

function computeCodeChurn(events) {
  const deduped = dedupeChurnEvents(events);
  const buckets = bucketByMinute(deduped);
  return buckets.map(({ time, items }) => {
    let added = 0;
    let removed = 0;
    for (const e of items) {
      const deltas = extractEventLineDeltas(e);
      added += deltas.added;
      removed += deltas.removed;
    }
    return { time, added, removed, net: added - removed };
  });
}

function computeSessionScatter(events) {
  return events
    .filter((e) => e.hook_event === 'stop' && e.session_duration_sec != null)
    .slice(-50)
    .map((e, i) => ({
      id: e.conversation_id ?? `session-${i}`,
      durationMin: Math.round((e.session_duration_sec / 60) * 10) / 10,
      model: e.model ?? 'default',
      timestamp: e.timestamp,
    }));
}

function computeHumanInterventions(events) {
  const interventions = events.filter((e) => {
    const perm =
      e.context_details?.permission ??
      e.context_details?.policy_verdict ??
      e.policy_verdict;
    return perm === 'ASK' || perm === 'ask' || e.context_details?.human_required === true;
  });

  const buckets = bucketByMinute(interventions);
  const sparkline = buckets.map(({ time, items }) => ({ time, count: items.length }));

  return {
    total: interventions.length,
    sparkline,
    recent: interventions.slice(-5).map((e) => ({
      time: e.timestamp,
      hook: e.hook_event,
      message: e.context_details?.user_message ?? 'Manual approval required',
    })),
  };
}

function normalizeTrendWindowMin(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TREND_WINDOW_MIN;
  }
  return Math.min(parsed, 60);
}

function eventsInWindow(events, now, windowMin, offsetMin = 0) {
  const windowSec = windowMin * 60;
  const end = now - offsetMin * 60;
  const start = end - windowSec;
  return events.filter((e) => e.timestamp >= start && e.timestamp < end);
}

function computeTrendDelta(recentValue, priorValue) {
  if (recentValue == null || Number.isNaN(recentValue)) {
    return { direction: 'flat', pct: 0 };
  }
  if (priorValue == null || priorValue === 0) {
    return { direction: recentValue > 0 ? 'up' : 'flat', pct: 0 };
  }

  const pct = Math.round(((recentValue - priorValue) / Math.abs(priorValue)) * 1000) / 10;
  const direction = pct > 5 ? 'up' : pct < -5 ? 'down' : 'flat';
  return { direction, pct };
}

function shellOutcomeCounts(events) {
  let success = 0;
  let failure = 0;
  for (const e of events) {
    const code = e.context_details?.exit_code ?? e.context_details?.exitCode ?? 0;
    if (code === 0) success++;
    else failure++;
  }
  return { success, failure };
}

function shellSuccessRate(counts) {
  const total = counts.success + counts.failure;
  return total ? (counts.success / total) * 100 : null;
}

function computeShellOutcomeSummary(events, now, windowMin) {
  const shellEvents = events.filter((e) => e.hook_event === 'afterShellExecution');
  const recentEvents = eventsInWindow(shellEvents, now, windowMin);
  const priorEvents = eventsInWindow(shellEvents, now, windowMin, windowMin);

  const recentCounts = shellOutcomeCounts(recentEvents);
  const priorCounts = shellOutcomeCounts(priorEvents);
  const total = recentCounts.success + recentCounts.failure;
  const rate = total ? Math.round(shellSuccessRate(recentCounts) * 10) / 10 : 0;
  const trend = computeTrendDelta(
    shellSuccessRate(recentCounts),
    shellSuccessRate(priorCounts),
  );

  return { success: recentCounts.success, failure: recentCounts.failure, rate, windowMinutes: windowMin, ...trend };
}

function computeThinkTimeSummary(events, now, windowMin) {
  const thinkEvents = events.filter((e) => e.hook_event === 'afterAgentThought');
  const recentEvents = eventsInWindow(thinkEvents, now, windowMin);
  const priorEvents = eventsInWindow(thinkEvents, now, windowMin, windowMin);

  const recentDurations = recentEvents
    .map((e) => extractDurationMs(e))
    .filter((d) => d != null && d > 0);
  const priorDurations = priorEvents
    .map((e) => extractDurationMs(e))
    .filter((d) => d != null && d > 0);

  const recentAvgSec = recentDurations.length
    ? recentDurations.reduce((a, b) => a + b, 0) / recentDurations.length / 1000
    : null;
  const priorAvgSec = priorDurations.length
    ? priorDurations.reduce((a, b) => a + b, 0) / priorDurations.length / 1000
    : null;

  const avgSec = recentAvgSec == null ? 0 : Math.round(recentAvgSec * 100) / 100;
  const trend = computeTrendDelta(recentAvgSec, priorAvgSec);

  return {
    avgSec,
    count: recentDurations.length,
    windowMinutes: windowMin,
    ...trend,
  };
}

function churnTotals(events) {
  let added = 0;
  let removed = 0;
  for (const e of events) {
    const deltas = extractEventLineDeltas(e);
    added += deltas.added;
    removed += deltas.removed;
  }
  return { added, removed, net: added - removed, total: added + removed };
}

function computeCodeChurnSummary(events, now, windowMin) {
  const deduped = dedupeChurnEvents(events);
  const recentEvents = eventsInWindow(deduped, now, windowMin);
  const priorEvents = eventsInWindow(deduped, now, windowMin, windowMin);

  const recent = churnTotals(recentEvents);
  const prior = churnTotals(priorEvents);
  const trend = computeTrendDelta(
    recent.total > 0 ? recent.total : null,
    prior.total > 0 ? prior.total : null,
  );

  return { ...recent, windowMinutes: windowMin, ...trend };
}

function bucketByMinute(events) {
  const map = new Map();
  for (const e of events) {
    const minute = Math.floor(e.timestamp / 60) * 60;
    if (!map.has(minute)) map.set(minute, []);
    map.get(minute).push(e);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-30)
    .map(([time, items]) => ({ time, items }));
}
