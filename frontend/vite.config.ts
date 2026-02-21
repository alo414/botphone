import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('x-api-key', '126590d2ac4858a3b992da427c8a796a9792504731415b38399686d4c9774a3c');
          });
        },
      },
      '/twilio': 'http://localhost:3000',
    },
  },
})
