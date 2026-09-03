import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * In production the SPA is same-origin with the chat API: nginx serves this bundle at
 * trade.squidlor.com and proxies /api/ to the oracle-chat server, so `fetch('/api/...')` needs
 * no CORS and no base URL. In dev, the same relative path is proxied to whichever backend
 * TRADE_API_ORIGIN names — by default the live one, so the board and every token page are real.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5040,
    proxy: {
      '/api': {
        target: process.env.TRADE_API_ORIGIN ?? 'https://chat.squidlor.com',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          web3: ['wagmi', 'viem', '@tanstack/react-query'],
          chart: ['lightweight-charts'],
        },
      },
    },
  },
});
