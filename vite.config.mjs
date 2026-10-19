import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const API = `http://127.0.0.1:${process.env.LEAO_PORT || 4321}`;
const TOKEN_FILE = path.join(process.env.LEAO_DATA_DIR || path.join(os.homedir(), '.leao'), 'token');

// Em desenvolvimento o HTML vem do Vite (sem o token do servidor): o proxy injeta o token atual em cada chamada.
function readToken() {
  try {
    return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  root: 'web',
  plugins: [vue()],
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API,
        changeOrigin: true,
        configure: (proxy) => proxy.on('proxyReq', (req) => req.setHeader('x-leao-token', readToken())),
      },
    },
  },
});
