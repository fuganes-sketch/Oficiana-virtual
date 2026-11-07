import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { oficinaApi } from './server/api'

export default defineConfig({
  plugins: [react(), oficinaApi()],
  base: './',
  server: {
    port: 3000,
    strictPort: true,
    // escucha en todas las interfaces para poder abrirla desde el teléfono por Tailscale; el filtro de abajo
    // (server/api.ts) deja pasar SOLO a esta PC y a la red privada de Tailscale
    host: true,
    allowedHosts: true,
    // los chats y las sesiones se guardan en data/: no deben recargar la página
    watch: { ignored: ['**/data/**', '**/agents/**'] },
  },
})
