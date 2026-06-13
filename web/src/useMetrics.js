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

export function useMetrics() {
  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws;
    let retryTimer;

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        retryTimer = setTimeout(connect, 2000);
      };
      ws.onmessage = (msg) => {
        const { type, data } = JSON.parse(msg.data);
        if (type === 'metrics') setMetrics(data);
      };
    }

    connect();

    return () => {
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  return { metrics, connected };
}

export function formatTime(unixSec) {
  return new Date(unixSec * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}
