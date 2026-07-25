import { useEffect, useRef, useState } from 'react';

const EMPTY_METRICS = {
  agentStateDistribution: [],
  securityBlockRate: { blocked: 0, allowed: 0, rate: 0 },
  thinkTimeSeries: [],
  thinkTimeSummary: { avgSec: 0, count: 0, direction: 'flat', pct: 0, windowMinutes: 0.5 },
  shellOutcomeSeries: [],
  shellOutcomeSummary: { success: 0, failure: 0, rate: 0, direction: 'flat', pct: 0, windowMinutes: 0.5 },
  blastRadius: [],
  mcpUsage: [],
  eventFeed: [],
  codeChurnSeries: [],
  codeChurnSummary: { added: 0, removed: 0, net: 0, total: 0, direction: 'flat', pct: 0, windowMinutes: 0.5 },
  sessionScatter: [],
  humanInterventions: { total: 0, sparkline: [], recent: [] },
  totals: { events: 0, recentEvents: 0, sessions: 0 },
  updatedAt: Date.now() / 1000,
};

function sendClientConfig(socket, { trendWindowMin, agent }) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'config',
      trendWindowMin,
      agent,
    }));
  }
}

function getWebSocketUrl(projectId) {
  const qs = `?project=${encodeURIComponent(projectId)}`;
  // In the packaged Electron app the page is served from a file:// URL, so
  // window.location.host is empty. Connect directly to the local API server.
  if (window.location.protocol === 'file:') {
    return `ws://localhost:3847/ws${qs}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws${qs}`;
}

export function useMetrics(projectId, trendWindowMin = 0.5, agent = 'all') {
  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const trendWindowRef = useRef(trendWindowMin);
  const agentRef = useRef(agent);

  trendWindowRef.current = trendWindowMin;
  agentRef.current = agent;

  useEffect(() => {
    if (projectId === null) {
      setMetrics(EMPTY_METRICS);
      setConnected(false);
      wsRef.current = null;
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
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        sendClientConfig(ws, {
          trendWindowMin: trendWindowRef.current,
          agent: agentRef.current,
        });
      };
      ws.onerror = () => setConnected(false);
      ws.onclose = () => {
        setConnected(false);
        if (wsRef.current === ws) wsRef.current = null;
        if (!cancelled && !intentionalClose) {
          retryTimer = setTimeout(connect, 2000);
        }
      };
      ws.onmessage = (msg) => {
        try {
          const { type, data } = JSON.parse(msg.data);
          if (type === 'metrics') {
            setMetrics({
              ...EMPTY_METRICS,
              ...data,
              eventFeed: data.eventFeed ?? [],
            });
          }
        } catch (err) {
          console.error('Failed to parse metrics message', err);
        }
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
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [projectId]);

  useEffect(() => {
    if (projectId === null || !connected) return undefined;
    sendClientConfig(wsRef.current, {
      trendWindowMin,
      agent,
    });
  }, [projectId, connected, trendWindowMin, agent]);

  return { metrics, connected };
}

export function formatTime(unixSec) {
  return new Date(unixSec * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}
