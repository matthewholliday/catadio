import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function ignoreBenignProxyErrors(proxy) {
  proxy.on('error', (err, _req, res) => {
    if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
    console.error('[vite] ws proxy error:', err);
    if (res && !res.headersSent) {
      res.writeHead(502);
      res.end();
    }
  });
  proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
    socket.on('error', (err) => {
      if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
      console.error('[vite] ws proxy socket error:', err);
    });
  });
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3847',
      '/ws': {
        target: 'ws://localhost:3847',
        ws: true,
        configure: ignoreBenignProxyErrors,
      },
    },
  },
});
