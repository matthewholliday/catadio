const MAX_EVENTS = 5000;
const MAX_ALERTS = 100;

/** @type {Map<string, { events: import('./metrics.js').TelemetryEvent[], alerts: import('./metrics.js').SecurityAlert[], sessionStarts: Map<string, number>, lastSeen: number }>} */
const stores = new Map();

function getOrCreate(projectId) {
  const id = projectId || 'default';
  if (!stores.has(id)) {
    stores.set(id, {
      events: [],
      alerts: [],
      sessionStarts: new Map(),
      lastSeen: Date.now() / 1000,
    });
  }
  return stores.get(id);
}

export function ingestEvent(payload, projectId = 'default') {
  const store = getOrCreate(projectId);
  const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    hook_event: payload.hook_event ?? 'unknown',
    timestamp: payload.timestamp ?? Date.now() / 1000,
    conversation_id: payload.conversation_id ?? null,
    generation_id: payload.generation_id ?? null,
    model: payload.model ?? null,
    policy_verdict: payload.policy_verdict ?? 'ALLOWED',
    context_details: payload.context_details ?? {},
    project_id: projectId,
  };

  store.events.push(event);
  if (store.events.length > MAX_EVENTS) {
    store.events.splice(0, store.events.length - MAX_EVENTS);
  }

  store.lastSeen = event.timestamp;
  trackSession(store, event);
  maybeRecordAlert(store, event);

  return event;
}

function trackSession(store, event) {
  const convId = event.conversation_id;
  if (!convId) return;

  if (event.hook_event === 'sessionStart' || !store.sessionStarts.has(convId)) {
    store.sessionStarts.set(convId, event.timestamp);
  }

  if (event.hook_event === 'stop') {
    const start = store.sessionStarts.get(convId);
    if (start != null) {
      event.session_duration_sec = event.timestamp - start;
    }
  }
}

function maybeRecordAlert(store, event) {
  if (event.policy_verdict === 'DENIED') {
    pushAlert(store, {
      type: 'policy_block',
      message: describeBlock(event),
      timestamp: event.timestamp,
      severity: 'high',
    });
    return;
  }

  if (event.hook_event === 'afterFileEdit') {
    const edits = event.context_details?.edits ?? event.context_details?.files ?? [];
    const text = JSON.stringify(edits).toLowerCase();
    if (/aws_secret|api_key|password\s*=|sk-[a-z0-9]{20,}/i.test(text)) {
      pushAlert(store, {
        type: 'secret_intercept',
        message: 'Potential secret detected in file edit',
        timestamp: event.timestamp,
        severity: 'critical',
      });
    }
  }

  if (event.hook_event === 'beforeShellExecution') {
    const cmd = event.context_details?.command ?? event.context_details?.text ?? '';
    if (/curl.*\|.*sh|typosquat|malware/i.test(cmd)) {
      pushAlert(store, {
        type: 'vulnerability',
        message: `Suspicious shell pattern: ${cmd.slice(0, 80)}`,
        timestamp: event.timestamp,
        severity: 'medium',
      });
    }
  }
}

function describeBlock(event) {
  if (event.hook_event === 'beforeShellExecution') {
    const cmd = event.context_details?.command ?? event.context_details?.text ?? 'unknown command';
    return `Blocked shell command: ${cmd.slice(0, 120)}`;
  }
  if (event.hook_event === 'beforeMCPExecution') {
    const server = event.context_details?.metadata?.server ?? event.context_details?.server ?? 'unknown';
    return `Blocked MCP call to ${server}`;
  }
  return `Policy denied ${event.hook_event}`;
}

function pushAlert(store, alert) {
  store.alerts.unshift(alert);
  if (store.alerts.length > MAX_ALERTS) {
    store.alerts.pop();
  }
}

export function getEvents(projectId = 'default') {
  return getOrCreate(projectId).events;
}

export function getAlerts(projectId = 'default') {
  return getOrCreate(projectId).alerts;
}

export function clearProject(projectId) {
  const store = stores.get(projectId);
  if (!store) return false;
  store.events.length = 0;
  store.alerts.length = 0;
  store.sessionStarts.clear();
  return true;
}

export function clearAll() {
  stores.clear();
}

export function listProjects() {
  return [...stores.entries()].map(([id, store]) => ({
    id,
    lastSeen: store.lastSeen,
    eventCount: store.events.length,
    alertCount: store.alerts.length,
  }));
}
