// UI template layer: starter. Installed by `pnpm ui:template starter`. Engineer-owned.
// To change a page, copy it into app/pages/ (app/ overrides this layer) and edit the copy.
export default defineNuxtConfig({
  // Prototypes render in the browser: the Worker serves the app shell and the API (server/api/).
  // Sign-in and the deploy guard still run on the server for every request (server/middleware/).
  ssr: false,
})
