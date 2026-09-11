import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { fileURLToPath } from 'node:url';

function devPageLog() {
  return {
    name: 'dev-page-log',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (typeof req.headers.accept === 'string' && req.headers.accept.includes('text/html')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
        next();
        if (typeof req.headers.accept !== 'string' || !req.headers.accept.includes('text/html')) return;
        const start = performance.now();
        res.on('finish', () => {
          const ms = (performance.now() - start).toFixed(1);
          const status = res.statusCode;
          const statusColor = status < 300 ? '\x1b[32;1m' : status < 400 ? '\x1b[36;1m' : status < 500 ? '\x1b[33;1m' : '\x1b[31;1m';
          const durColor = Number(ms) < 100 ? '\x1b[32m' : Number(ms) < 500 ? '\x1b[33m' : '\x1b[35;1m';
          const statusText = status === 200 ? '200 OK' : status === 304 ? '304 Not Modified' : `${status}`;
          const methodStr = (req.method || 'GET').padEnd(6);
          const urlStr = (req.url || '/').length > 38 ? (req.url || '/').slice(0, 35) + '...' : (req.url || '/').padEnd(38);
          const durStr = `${ms}ms`.padStart(7);
          console.log(`PAGE  \x1b[36;1m${methodStr}\x1b[0m ${urlStr} ${statusColor}${statusText.padEnd(16)}\x1b[0m ${durColor}${durStr}\x1b[0m`);
        });
      });
    },
  };
}

export default defineConfig({
  output: 'static',
  outDir: fileURLToPath(new URL('../backend/web/public', import.meta.url)),
  integrations: [react()],
  compressHTML: true,
  server: { port: Number(process.env.FRONTEND_PORT || 3000) },
  vite: {
    plugins: [devPageLog()],
    server: {
      proxy: {
        // Dev: browser bicara ke frontend dev port, API & WS dilewatkan ke backend Go
        '/api': {
          target: process.env.BACKEND_PROXY_TARGET || process.env.API_PROXY_TARGET || ('http://127.0.0.1:' + (process.env.BACKEND_PORT || process.env.PORT || '8080')),
          changeOrigin: true,
          headers: {
            Connection: 'close',
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              // Bersihkan cookie raksasa dari project lain di localhost agar header tidak overflow
              const rawCookie = req.headers.cookie;
              if (rawCookie) {
                const ptspCookies = rawCookie
                  .split(';')
                  .map((c) => c.trim())
                  .filter((c) => c.startsWith('ptsp.'))
                  .join('; ');
                proxyReq.setHeader('cookie', ptspCookies);
              }
              // Proxy forwarding sengaja tidak di-log agar tidak duplikat dengan log backend Go
            });
            proxy.on('error', (err, req, res) => {
              console.error(`\x1b[31;1m[FE PROXY ERROR]\x1b[0m ${req.method} ${req.url} -> ${err.message}`);
              if (res && !res.headersSent && typeof res.writeHead === 'function') {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Backend sedang memuat ulang. Coba sesaat lagi.' }));
              }
            });
          },
        },
        '/ws': {
          target: process.env.WS_PROXY_TARGET || ('ws://127.0.0.1:' + (process.env.BACKEND_PORT || process.env.PORT || '8080')),
          ws: true,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('error', () => {
              // Menekan pesan unhandled socket abort saat client disconnect
            });
          },
        },
      },
    },
    build: {
      // Fiber serve semua output di akar domain, jadi jangan hash asset.
      assetsDir: '_astro',
    },
  },
});