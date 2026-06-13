import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { computeMetrics } from './metrics.js';
import { clearAll, ingestEvent } from './store.js';

const PORT = process.env.PORT ?? 3847;
const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

/** @type {Set<import('ws').WebSocket>} */
const clients = new Set();

function broadcast(type, data) {
  const msg = JSON.stringify({ type, data });
  for (const client of clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

function pushMetrics() {
  broadcast('metrics', computeMetrics());
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/metrics', (_req, res) => {
  res.json(computeMetrics());
});

app.post('/api/v1/telemetry', (req, res) => {
  const event = ingestEvent(req.body);
  broadcast('event', event);
  pushMetrics();
  res.status(202).json({ accepted: true, id: event.id });
});

app.post('/api/demo/reset', (_req, res) => {
  clearAll();
  pushMetrics();
  res.json({ cleared: true });
});

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'metrics', data: computeMetrics() }));

  ws.on('close', () => clients.delete(ws));
});

httpServer.listen(PORT, () => {
  console.log(`Agent dashboard API listening on http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
});

export { PORT };
