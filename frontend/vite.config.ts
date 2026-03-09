import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/hub-verify': {
        target: 'https://hub.ag3nts.org',
        changeOrigin: true,
        rewrite: () => '/verify',
      },
    },
  },
});
