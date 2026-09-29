// Locked stack: Nuxt full-stack on Cloudflare Workers.
//   UI:    Nuxt UI (components + the installed template shell in layers/ui/)
//   State: Pinia for client-only state, Pinia Colada for everything fetched from the server
//   Data:  D1 (database) and KV (settings/cache). Bindings live in wrangler.jsonc, which an engineer owns.
export default defineNuxtConfig({
  compatibilityDate: '2026-08-01',
  devtools: { enabled: false },
  modules: [
    '@nuxt/ui',
    '@pinia/nuxt',
    '@pinia/colada-nuxt',
    // Gives `nuxt dev` the same DB/KV bindings as production, backed by local files in .wrangler/.
    'nitro-cloudflare-dev',
  ],
  css: ['~/assets/css/main.css'],
  // app/queries/: one Pinia Colada composable file per kind of server data (auto-imported).
  imports: { dirs: ['queries'] },
  // Fonts are bundled in public/fonts/ (Google Sans, see app/assets/css/main.css): Nuxt UI's font
  // module, which downloads fonts from Google or Bunny at build time, is off.
  ui: { fonts: false },
  icon: {
    // Lucide icons come from the installed @iconify-json/lucide set and are bundled into the app.
    // Never fetched from the Iconify API: no third-party calls, at build time or in the browser.
    // The client bundle holds every icon the app's files use, plus the ones Nuxt UI's own
    // components use (chevrons, close, loading…), so pages don't ask the server for icons either.
    serverBundle: 'local',
    clientBundle: {
      scan: {
        globInclude: ['**/*.{vue,ts,js,mjs,jsx,tsx,md,mdc,mdx,yml,yaml}', 'node_modules/@nuxt/ui/dist/**/*.{vue,mjs}'],
        globExclude: ['.nuxt/**', '.output/**', '.wrangler/**', 'coverage/**', 'test-results/**', 'playwright-report/**'],
      },
    },
    fallbackToApi: false,
  },
  nitro: {
    preset: 'cloudflare_module',
    cloudflare: {
      // wrangler.jsonc is the single source of truth — don't let the build write another one.
      deployConfig: false,
      nodeCompat: true,
    },
  },
  typescript: {
    strict: true,
  },
})
