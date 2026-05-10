import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    // リポジトリルートへのアクセスを許可（state_archive/ を fetch するため）
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
});
