import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so bundled assets load inside Capacitor (file/capacitor URL).
// Still works for typical static hosting at domain root (e.g. Vercel).
export default defineConfig({
  plugins: [react()],
  base: './',
})
