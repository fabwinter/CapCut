import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

// Cross-origin isolation (SharedArrayBuffer, ffmpeg.wasm multithreading) needs
// these on every response. `vercel.json` sets them for the actual Vercel
// deployment; Nitro's own preview server (used by `vite preview` and by the
// Playwright webServer) ignores Vite's `server`/`preview.headers` options once
// the vercel preset takes over serving, so they're set here too via routeRules
// to keep `vite dev` / `vite preview` / CI faithful to production.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

// Vercel is the only deploy target for this app.
const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    nitro({
      preset: 'vercel',
      routeRules: { '/**': { headers: isolationHeaders } },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  worker: {
    format: 'es',
  },
})

export default config
