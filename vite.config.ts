import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

function discoverBackendPort(): number {
  const portFile = path.resolve(__dirname, '.server-port');
  try {
    const port = Number(fs.readFileSync(portFile, 'utf8').trim());
    if (port > 0) return port;
  } catch {}
  return Number(process.env.GRAVITY_CLAW_PORT ?? 5178);
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5177,
    host: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${discoverBackendPort()}`,
        changeOrigin: true,
      },
    },
  },
});
