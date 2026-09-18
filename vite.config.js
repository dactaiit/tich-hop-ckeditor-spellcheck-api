import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      // Chuyển tiếp API convert .doc sang Node server (server/index.mjs).
      '/api': {
        target: 'http://localhost:5175',
        changeOrigin: true,
      },
      // Chuyển tiếp API kiểm tra chính tả (không có CORS -> phải proxy).
      '/spell': {
        target: 'http://124.197.20.172:8760',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/spell/, ''),
      },
    },
  },
})
