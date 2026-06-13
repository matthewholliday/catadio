import './env.js';
import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { generateCommentary } from './commentary.js';
import { computeMetrics, DEFAULT_TREND_WINDOW_MIN } from './metrics.js';
import {
  DEFAULT_COMMENTARY_INTERVAL_SEC,
  clearAll,
  clearProject,
  getLastCommentaryAt,
  ingestEvent,
  isCommentaryInFlight,
  listProjects,
  setCommentaryInFlight,
  setCommentaryIntervalSec,
  setLastCommentaryAt,
} from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? 3847;
const COMMENTARY_TICK_MS = 5000;
const MIN_COMMENTARY_INTERVAL_SEC = 30;
const MAX_COMMENTARY_INTERVAL_SEC = 600;

/** @type {import('http').Server | null} */
let httpServer = null;

/** @type {ReturnType<typeof setInterval> | null} */
let commentaryTickTimer = null;

/** @type {Set<import('ws').WebSocket & { _projectId?: string, _trendWindowMin?: number, _commentaryIntervalSec?: number }>} */
const clients = new Set();

function normalizeCommentaryIntervalSec(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_COMMENTARY_INTERVAL_SEC;
  }
  return Math.min(Math.max(Math.round(parsed), MIN_COMMENTARY_INTERVAL_SEC), MAX_COMMENTARY_INTERVAL_SEC);
}

function broadcastToProject(projectId, type, data) {
  const msg = JSON.stringify({ type, data });
  for (const client of clients) {
    if (client.readyState === 1 && client._projectId === projectId) {
      client.send(msg);
    }
  }
}

function pushMetrics(projectId) {
  for (const client of clients) {
    if (client.readyState === 1 && client._projectId === projectId) {
      const data = computeMetrics(projectId, { trendWindowMin: client._trendWindowMin });
      client.send(JSON.stringify({ type: 'metrics', data }));
    }
  }
}

async function maybeGenerateCommentary(projectId, { force = false } = {}) {
  const intervalSec = normalizeCommentaryIntervalSec(
    [...clients]
      .filter((c) => c._projectId === projectId && c._commentaryIntervalSec != null)
      .map((c) => c._commentaryIntervalSec)
      .at(-1) ?? DEFAULT_COMMENTARY_INTERVAL_SEC,
  );

  setCommentaryIntervalSec(projectId, intervalSec);

  const now = Date.now() / 1000;
  const lastAt = getLastCommentaryAt(projectId);
  if (!force && lastAt > 0 && now - lastAt < intervalSec) {
    return;
  }
  if (isCommentaryInFlight(projectId)) {
    return;
  }

  setCommentaryInFlight(projectId, true);
  pushMetrics(projectId);

  try {
    await generateCommentary(projectId, intervalSec);
    setLastCommentaryAt(projectId, Date.now() / 1000);
  } finally {
    setCommentaryInFlight(projectId, false);
    pushMetrics(projectId);
  }
}

function runCommentaryTick() {
  const projectIds = new Set([
    ...listProjects().map((p) => p.id),
    ...[...clients].map((c) => c._projectId).filter(Boolean),
  ]);

  for (const projectId of projectIds) {
    maybeGenerateCommentary(projectId).catch((err) => {
      console.error(`Commentary generation failed for ${projectId}:`, err);
    });
  }
}

function startCommentaryScheduler() {
  if (commentaryTickTimer) return;
  commentaryTickTimer = setInterval(runCommentaryTick, COMMENTARY_TICK_MS);
}

function stopCommentaryScheduler() {
  if (commentaryTickTimer) {
    clearInterval(commentaryTickTimer);
    commentaryTickTimer = null;
  }
}

function applyClientConfig(ws) {
  const projectId = ws._projectId ?? 'default';
  let changed = false;

  if (ws._commentaryIntervalSec != null) {
    setCommentaryIntervalSec(projectId, normalizeCommentaryIntervalSec(ws._commentaryIntervalSec));
    changed = true;
  }

  if (changed) {
    maybeGenerateCommentary(projectId, { force: true }).catch((err) => {
      console.error(`Commentary generation failed for ${projectId}:`, err);
    });
  }
}

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/projects', (_req, res) => {
    res.json(listProjects());
  });

  app.get('/api/metrics', (req, res) => {
    const projectId = req.query.project ?? 'default';
    const trendWindowMin = req.query.trendWindowMin ?? DEFAULT_TREND_WINDOW_MIN;
    res.json(computeMetrics(projectId, { trendWindowMin }));
  });

  app.post('/api/v1/telemetry', (req, res) => {
    const projectId = req.query.project ?? req.body.project_id ?? 'default';
    const event = ingestEvent(req.body, projectId);
    broadcastToProject(projectId, 'event', event);
    pushMetrics(projectId);
    res.status(202).json({ accepted: true, id: event.id, project_id: projectId });
  });

  app.delete('/api/projects/:id', (req, res) => {
    const cleared = clearProject(req.params.id);
    if (!cleared) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    pushMetrics(req.params.id);
    res.json({ cleared: true, project_id: req.params.id });
  });

  app.post('/api/demo/reset', (req, res) => {
    const projectId = req.query.project ?? 'default';
    if (projectId === 'all') {
      clearAll();
      for (const client of clients) {
        if (client._projectId) pushMetrics(client._projectId);
      }
    } else {
      clearProject(projectId);
      pushMetrics(projectId);
    }
    res.json({ cleared: true, project_id: projectId });
  });

  if (process.env.NODE_ENV === 'production') {
    const webDist = process.env.WEB_DIST_PATH ?? path.join(__dirname, '..', 'web', 'dist');
    app.use(express.static(webDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  return app;
}

export function startServer(options = {}) {
  if (httpServer) {
    return Promise.resolve({ port: PORT, httpServer });
  }

  const port = options.port ?? PORT;
  const app = createApp();
  httpServer = createServer(app);

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/ws', 'ws://localhost');
    const projectId = url.searchParams.get('project') ?? 'default';
    ws._projectId = projectId;
    ws._trendWindowMin = DEFAULT_TREND_WINDOW_MIN;
    ws._commentaryIntervalSec = DEFAULT_COMMENTARY_INTERVAL_SEC;
    clients.add(ws);
    ws.send(JSON.stringify({
      type: 'metrics',
      data: computeMetrics(projectId, { trendWindowMin: ws._trendWindowMin }),
    }));

    applyClientConfig(ws);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'config') {
          if (msg.trendWindowMin != null) {
            ws._trendWindowMin = msg.trendWindowMin;
          }
          if (msg.commentaryIntervalSec != null) {
            ws._commentaryIntervalSec = normalizeCommentaryIntervalSec(msg.commentaryIntervalSec);
          }
          applyClientConfig(ws);
          ws.send(JSON.stringify({
            type: 'metrics',
            data: computeMetrics(projectId, { trendWindowMin: ws._trendWindowMin }),
          }));
        }
      } catch {
        // Ignore malformed client messages
      }
    });

    ws.on('close', () => clients.delete(ws));
  });

  startCommentaryScheduler();

  return new Promise((resolve, reject) => {
    httpServer.once('error', (err) => {
      httpServer = null;
      reject(err);
    });
    httpServer.listen(port, () => {
      console.log(`Agent dashboard API listening on http://localhost:${port}`);
      console.log(`WebSocket: ws://localhost:${port}/ws`);
      resolve({ port, httpServer });
    });
  });
}

export function stopServer() {
  stopCommentaryScheduler();
  return new Promise((resolve, reject) => {
    if (!httpServer) {
      resolve();
      return;
    }
    httpServer.close((err) => {
      if (err) reject(err);
      else {
        httpServer = null;
        clients.clear();
        resolve();
      }
    });
  });
}

export { PORT };

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startServer();
}
