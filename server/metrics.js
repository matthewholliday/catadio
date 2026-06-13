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

export function computeMetrics() {
  const events = getEvents();
  const now = Date.now() / 1000;
  const windowSec = 3600;
  const recent = events.filter((e) => e.timestamp >= now - windowSec);

  return {
    agentStateDistribution: computeAgentState(recent),
    securityBlockRate: computeSecurityBlockRate(recent),
    thinkTimeSeries: computeThinkTimeSeries(recent),
    shellOutcomeSeries: computeShellOutcomes(recent),
    blastRadius: computeBlastRadius(recent),
    mcpUsage: computeMcpUsage(recent),
    securityAlerts: getAlerts().slice(0, 20),
    codeChurnSeries: computeCodeChurn(recent),
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
    return ctx.edits.map((ed) => ed.path ?? ed.file ?? ed.filename).filter(Boolean);
  }
  if (ctx.path) return [ctx.path];
  if (ctx.file) return [ctx.file];
  return ['unknown'];
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
  const buckets = bucketByMinute(events.filter((e) => e.hook_event === 'afterFileEdit'));
  return buckets.map(({ time, items }) => {
    let added = 0;
    let removed = 0;
    for (const e of items) {
      const ctx = e.context_details ?? {};
      if (Array.isArray(ctx.edits)) {
        for (const ed of ctx.edits) {
          added += ed.lines_added ?? ed.added ?? 0;
          removed += ed.lines_removed ?? ed.removed ?? 0;
        }
      } else {
        added += ctx.lines_added ?? ctx.added ?? 0;
        removed += ctx.lines_removed ?? ctx.removed ?? 0;
      }
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
