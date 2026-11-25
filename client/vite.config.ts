import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.VITE_PORT ?? 5173),
    strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${process.env.PORT ?? 3001}`,
    },
    fs: {
      allow: ['..'],
    },
    watch: {
      ignored: ['**/node_modules/**'],
    },
  },
});
