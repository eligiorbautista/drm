import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/cf-stream': {
          target: env.VITE_CLOUDFLARE_STREAM_DOMAIN || 'https://customer-zl11k93xxb6833cs.cloudflarestream.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/cf-stream/, ''),
        },
        // WHIP publish endpoint for broadcaster
        '/cf-publish': {
          target: env.VITE_CLOUDFLARE_STREAM_DOMAIN || 'https://customer-zl11k93xxb6833cs.cloudflarestream.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/cf-publish/, ''),
        }
      }
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
        },
      },
    },
  }
})
