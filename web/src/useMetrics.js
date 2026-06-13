import { useEffect, useState } from 'react';

const EMPTY_METRICS = {
  agentStateDistribution: [],
  securityBlockRate: { blocked: 0, allowed: 0, rate: 0 },
  thinkTimeSeries: [],
  shellOutcomeSeries: [],
  blastRadius: [],
  mcpUsage: [],
  securityAlerts: [],
  codeChurnSeries: [],
  sessionScatter: [],
  humanInterventions: { total: 0, sparkline: [], recent: [] },
  totals: { events: 0, recentEvents: 0, sessions: 0 },
  updatedAt: Date.now() / 1000,
};

function getWebSocketUrl(projectId) {
  const qs = `?project=${encodeURIComponent(projectId)}`;
  if (import.meta.env.DEV) {
    return `ws://localhost:3847/ws${qs}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws${qs}`;
}

export function useMetrics(projectId) {
  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (projectId === null) {
      setMetrics(EMPTY_METRICS);
      setConnected(false);
      return undefined;
    }

    const effectiveProjectId = projectId ?? 'default';
    let ws;
    let retryTimer;
    let cancelled = false;
    let intentionalClose = false;

    function connect() {
      if (cancelled) return;

      intentionalClose = false;
      ws = new WebSocket(getWebSocketUrl(effectiveProjectId));

      ws.onopen = () => setConnected(true);
      ws.onerror = () => setConnected(false);
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled && !intentionalClose) {
          retryTimer = setTimeout(connect, 2000);
        }
      };
      ws.onmessage = (msg) => {
        const { type, data } = JSON.parse(msg.data);
        if (type === 'metrics') setMetrics(data);
      };
    }

    setMetrics(EMPTY_METRICS);
    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      if (ws && ws.readyState === WebSocket.OPEN) {
        intentionalClose = true;
        ws.close(1000, 'component unmounted');
      } else {
        ws?.close();
      }
    };
  }, [projectId]);

  return { metrics, connected };
}

export function formatTime(unixSec) {
  return new Date(unixSec * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}
