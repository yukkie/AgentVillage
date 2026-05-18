import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

const ARCHIVE_DIR = path.resolve(__dirname, '../state_archive');

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
  ],
  server: {
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
});
