import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'), // ← agregar este
        '@renderer': resolve('src/renderer/src') // ← dejar este también
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
