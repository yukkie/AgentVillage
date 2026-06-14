import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

const ARCHIVE_DIR = path.resolve(__dirname, '../state_archive');
const STATS_DIR = path.resolve(__dirname, '../state/stats');

export default defineConfig({
  plugins: [
    react(),
    // Serve state_archive/ as static files under /state_archive/ (local dev only).
    // Replace with FastAPI endpoint in production (#315).
    {
      name: 'serve-state-archive',
      configureServer(server) {
        server.middlewares.use('/state_archive', (req, res, next) => {
          const filePath = path.join(ARCHIVE_DIR, req.url);
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            res.setHeader('Content-Type', 'application/json');
            fs.createReadStream(filePath).pipe(res);
          } else {
            next();
          }
        });
      },
    },
    // Serve state/stats/ as static files under /stats/ (local dev only).
    // game_stats.json (#522 global profile mode). Replace with FastAPI in production (#315).
    {
      name: 'serve-state-stats',
      configureServer(server) {
        server.middlewares.use('/stats', (req, res, next) => {
          const filePath = path.join(STATS_DIR, req.url);
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            res.setHeader('Content-Type', 'application/json');
            fs.createReadStream(filePath).pipe(res);
          } else {
            next();
          }
        });
      },
    },
  ],
  server: {
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
    // SPA fallback: serve index.html for unknown routes so React Router handles them.
    // /state_archive/ is served by the custom middleware above and never falls through.
    historyApiFallback: true,
  },
});
