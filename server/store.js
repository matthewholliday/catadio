const MAX_EVENTS = 5000;
export const DEFAULT_COMMENTARY_INTERVAL_SEC = 120;

/** @type {Map<string, { events: import('./metrics.js').TelemetryEvent[], sessionStarts: Map<string, number>, lastSeen: number, commentary: import('./commentary.js').CommentaryState, commentaryIntervalSec: number, lastCommentaryAt: number, commentaryInFlight: boolean }>} */
const stores = new Map();

function defaultCommentary(intervalSec = DEFAULT_COMMENTARY_INTERVAL_SEC) {
  return {
    text: null,
    generatedAt: null,
    eventCount: 0,
    intervalSec,
    status: 'idle',
  };
}

function getOrCreate(projectId) {
  const id = projectId || 'default';
  if (!stores.has(id)) {
    stores.set(id, {
      events: [],
      sessionStarts: new Map(),
      lastSeen: Date.now() / 1000,
      commentary: defaultCommentary(),
      commentaryIntervalSec: DEFAULT_COMMENTARY_INTERVAL_SEC,
      lastCommentaryAt: 0,
      commentaryInFlight: false,
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

export function getEvents(projectId = 'default') {
  return getOrCreate(projectId).events;
}

export function getEventsInWindow(projectId, windowSec) {
  const now = Date.now() / 1000;
  const start = now - windowSec;
  return getEvents(projectId).filter((e) => e.timestamp >= start);
}

export function getCommentary(projectId = 'default') {
  const store = getOrCreate(projectId);
  const now = Date.now() / 1000;
  const intervalSec = store.commentaryIntervalSec;
  const lastAt = store.lastCommentaryAt;
  const nextCommentaryAt = lastAt > 0 ? lastAt + intervalSec : now + intervalSec;

  return {
    ...store.commentary,
    intervalSec,
    nextCommentaryAt,
  };
}

export function setCommentary(projectId, commentary) {
  const store = getOrCreate(projectId);
  store.commentary = {
    ...commentary,
    intervalSec: store.commentaryIntervalSec,
  };
}

export function getCommentaryIntervalSec(projectId = 'default') {
  return getOrCreate(projectId).commentaryIntervalSec;
}

export function setCommentaryIntervalSec(projectId, intervalSec) {
  const store = getOrCreate(projectId);
  store.commentaryIntervalSec = intervalSec;
  store.commentary = { ...store.commentary, intervalSec };
}

export function getLastCommentaryAt(projectId = 'default') {
  return getOrCreate(projectId).lastCommentaryAt;
}

export function setLastCommentaryAt(projectId, timestamp) {
  getOrCreate(projectId).lastCommentaryAt = timestamp;
}

export function isCommentaryInFlight(projectId = 'default') {
  return getOrCreate(projectId).commentaryInFlight;
}

export function setCommentaryInFlight(projectId, inFlight) {
  getOrCreate(projectId).commentaryInFlight = inFlight;
}

export function clearProject(projectId) {
  const store = stores.get(projectId);
  if (!store) return false;
  store.events.length = 0;
  store.sessionStarts.clear();
  store.commentary = defaultCommentary(store.commentaryIntervalSec);
  store.lastCommentaryAt = 0;
  store.commentaryInFlight = false;
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
  }));
}
