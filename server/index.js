import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { computeMetrics } from './metrics.js';
import { clearAll, clearProject, ingestEvent, listProjects } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? 3847;

/** @type {import('http').Server | null} */
let httpServer = null;

/** @type {Set<import('ws').WebSocket & { _projectId?: string }>} */
const clients = new Set();

function broadcastToProject(projectId, type, data) {
  const msg = JSON.stringify({ type, data });
  for (const client of clients) {
    if (client.readyState === 1 && client._projectId === projectId) {
      client.send(msg);
    }
  }
}

function pushMetrics(projectId) {
  broadcastToProject(projectId, 'metrics', computeMetrics(projectId));
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
    res.json(computeMetrics(projectId));
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
    clients.add(ws);
    ws.send(JSON.stringify({ type: 'metrics', data: computeMetrics(projectId) }));

    ws.on('close', () => clients.delete(ws));
  });

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
