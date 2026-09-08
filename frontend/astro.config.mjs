import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { fileURLToPath } from 'node:url';

function devPageLog() {
  return {
    name: 'dev-page-log',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        next();
        if (typeof req.headers.accept !== 'string' || !req.headers.accept.includes('text/html')) return;
        const start = performance.now();
        res.on('finish', () => {
          const ms = (performance.now() - start).toFixed(1);
          const color = res.statusCode < 400 ? '\x1b[32m' : res.statusCode < 500 ? '\x1b[33m' : '\x1b[31m';
          console.log(`\x1b[36m[FE]\x1b[0m Halaman ${req.method} ${req.url} ${color}${res.statusCode}\x1b[0m ${ms}ms`);
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
  server: { port: 3000 },
  vite: {
    plugins: [devPageLog()],
    server: {
      proxy: {
        // Dev: browser bicara ke :3000, API & WS dilewatkan ke backend Go :8080.
        '/api': 'http://127.0.0.1:8080',
        '/ws': { target: 'ws://127.0.0.1:8080', ws: true },
      },
    },
    build: {
      // Fiber serve semua output di akar domain, jadi jangan hash asset.
      assetsDir: '_astro',
    },
  },
});