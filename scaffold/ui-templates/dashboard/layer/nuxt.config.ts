// UI template layer: dashboard. Installed by `pnpm ui:template dashboard`. Engineer-owned.
// To change a page, copy it into app/pages/ (app/ overrides this layer) and edit the copy.
// Every page is a <UDashboardPanel> with a <UDashboardNavbar>. Copy pages/reports.vue as the pattern.
export default defineNuxtConfig({
  // Staff tools render in the browser: the Worker serves the app shell and the API (server/api/).
  // Sign-in and the deploy guard still run on the server for every request (server/middleware/).
  ssr: false,
})
