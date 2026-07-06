import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Broaden browser compatibility: some mobile / in-app browsers (WhatsApp,
    // Gmail webview) run older engines that choke on very modern syntax.
    target: ['es2019', 'chrome80', 'safari13', 'firefox78', 'edge80'],
  },
})
