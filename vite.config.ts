import { defineConfig, type Plugin } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

// Cross-origin isolation (SharedArrayBuffer, ffmpeg.wasm multithreading, and
// loading module workers at all) needs these on every response.
// `vercel.json` sets them for the actual Vercel deployment. Locally, the
// document/SSR routes go through Nitro (routeRules below), but `vite preview`
// serves `.vercel/output/static/assets/*` — including our worker bundle —
// through Vite's own static server, which never sees routeRules. Without
// `preview.headers` too, that request fails COEP's cross-origin-resource-policy
// check and the media worker silently never loads. Both are set so dev/preview
// stay faithful to production regardless of which layer handles a request.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

// Nitro's own static-asset middleware (used by `vite preview` for the
// `vercel` preset's prebuilt `.vercel/output/static` files) returns a
// response before routeRules headers get attached, so `/assets/*` — the
// media worker bundle included — loads without them locally even though
// routeRules cover the document routes fine. Setting headers here, in a
// plugin registered before `nitro()`, wins regardless of which internal
// path ends up serving a given request.
function setIsolationHeaders(res: { setHeader: (key: string, value: string) => void }): void {
  for (const [key, value] of Object.entries(isolationHeaders)) res.setHeader(key, value)
}

function isolationHeadersPlugin(): Plugin {
  return {
    name: 'isolation-headers',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        setIsolationHeaders(res)
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        setIsolationHeaders(res)
        next()
      })
    },
  }
}

// Vercel is the only deploy target for this app.
const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    isolationHeadersPlugin(),
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
