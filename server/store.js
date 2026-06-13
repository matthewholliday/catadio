const MAX_EVENTS = 5000;
const MAX_ALERTS = 100;

/** @type {import('./metrics.js').TelemetryEvent[]} */
const events = [];

/** @type {import('./metrics.js').SecurityAlert[]} */
const alerts = [];

/** @type {Map<string, number>} */
const sessionStarts = new Map();

export function ingestEvent(payload) {
  const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    hook_event: payload.hook_event ?? 'unknown',
    timestamp: payload.timestamp ?? Date.now() / 1000,
    conversation_id: payload.conversation_id ?? null,
    generation_id: payload.generation_id ?? null,
    model: payload.model ?? null,
    policy_verdict: payload.policy_verdict ?? 'ALLOWED',
    context_details: payload.context_details ?? {},
  };

  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }

  trackSession(event);
  maybeRecordAlert(event);

  return event;
}

function trackSession(event) {
  const convId = event.conversation_id;
  if (!convId) return;

  if (event.hook_event === 'sessionStart' || !sessionStarts.has(convId)) {
    sessionStarts.set(convId, event.timestamp);
  }

  if (event.hook_event === 'stop') {
    const start = sessionStarts.get(convId);
    if (start != null) {
      event.session_duration_sec = event.timestamp - start;
    }
  }
}

function maybeRecordAlert(event) {
  if (event.policy_verdict === 'DENIED') {
    pushAlert({
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
      pushAlert({
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
      pushAlert({
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

function pushAlert(alert) {
  alerts.unshift(alert);
  if (alerts.length > MAX_ALERTS) {
    alerts.pop();
  }
}

export function getEvents() {
  return events;
}

export function getAlerts() {
  return alerts;
}

export function clearAll() {
  events.length = 0;
  alerts.length = 0;
  sessionStarts.clear();
}
