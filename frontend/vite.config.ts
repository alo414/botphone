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
            if (process.env.DEV_API_KEY) {
              proxyReq.setHeader('x-api-key', process.env.DEV_API_KEY);
            }
          });
        },
      },
      '/twilio': 'http://localhost:3000',
    },
  },
})
