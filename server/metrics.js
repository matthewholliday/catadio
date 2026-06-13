import { getAlerts, getEvents } from './store.js';

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

export function computeMetrics(projectId = 'default') {
  const events = getEvents(projectId);
  const now = Date.now() / 1000;
  const windowSec = 3600;
  const recent = events.filter((e) => e.timestamp >= now - windowSec);

  const thinkTimeSeries = computeThinkTimeSeries(recent);
  const shellOutcomeSeries = computeShellOutcomes(recent);
  const codeChurnSeries = computeCodeChurn(recent);

  return {
    agentStateDistribution: computeAgentState(recent),
    securityBlockRate: computeSecurityBlockRate(recent),
    thinkTimeSeries,
    thinkTimeSummary: computeThinkTimeSummary(thinkTimeSeries),
    shellOutcomeSeries,
    shellOutcomeSummary: computeShellOutcomeSummary(shellOutcomeSeries),
    blastRadius: computeBlastRadius(recent),
    mcpUsage: computeMcpUsage(recent),
    securityAlerts: getAlerts(projectId).slice(0, 20),
    codeChurnSeries,
    codeChurnSummary: computeCodeChurnSummary(codeChurnSeries),
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
    event.generation_id ?? event.conversation_id ?? 'unknown',
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

function computeCodeChurn(events) {
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

  const deduped = [...bestByKey.values()].map(({ event }) => event);
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

function computeTrend(series, valueFn) {
  if (series.length < 2) {
    return { direction: 'flat', pct: 0 };
  }

  const half = Math.max(1, Math.floor(series.length / 2));
  const recent = series.slice(-half);
  const prior = series.slice(-half * 2, -half);

  const avg = (items) => {
    const values = items.map(valueFn).filter((v) => v != null && !Number.isNaN(v));
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };

  const recentAvg = avg(recent);
  const priorAvg = prior.length ? avg(prior) : null;

  if (recentAvg == null) return { direction: 'flat', pct: 0 };
  if (priorAvg == null || priorAvg === 0) {
    return { direction: recentAvg > 0 ? 'up' : 'flat', pct: 0 };
  }

  const pct = Math.round(((recentAvg - priorAvg) / Math.abs(priorAvg)) * 1000) / 10;
  const direction = pct > 5 ? 'up' : pct < -5 ? 'down' : 'flat';
  return { direction, pct };
}

function computeShellOutcomeSummary(series) {
  let success = 0;
  let failure = 0;
  for (const bucket of series) {
    success += bucket.success;
    failure += bucket.failure;
  }

  const total = success + failure;
  const rate = total ? Math.round((success / total) * 1000) / 10 : 0;
  const trend = computeTrend(series, (d) => {
    const bucketTotal = d.success + d.failure;
    return bucketTotal ? (d.success / bucketTotal) * 100 : null;
  });

  return { success, failure, rate, ...trend };
}

function computeThinkTimeSummary(series) {
  const withData = series.filter((d) => d.count > 0);
  const avgSec = withData.length
    ? Math.round((withData.reduce((s, d) => s + d.avgThinkSec, 0) / withData.length) * 100) / 100
    : 0;
  const trend = computeTrend(withData, (d) => d.avgThinkSec);

  return {
    avgSec,
    count: withData.reduce((s, d) => s + d.count, 0),
    ...trend,
  };
}

function computeCodeChurnSummary(series) {
  let added = 0;
  let removed = 0;
  for (const bucket of series) {
    added += bucket.added;
    removed += bucket.removed;
  }

  const net = added - removed;
  const total = added + removed;
  const trend = computeTrend(series, (d) => d.added + d.removed);

  return { added, removed, net, total, ...trend };
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
