// Config for Cloudflare's `cf` CLI (deploys, previews). Engineer-owned (red tier).
// It holds no settings of its own: every name, ID and var comes from wrangler.jsonc, which
// `nuxt dev` also reads for local bindings, so the two can't drift. Fill in wrangler.jsonc.
//   cf deploy               → the production Worker (top level of wrangler.jsonc)
//   cf deploy --mode preview → "<name>-preview" (env.preview), with its own D1 and KV
// DEPLOYED_FROM / DEPLOYED_COMMIT come only from scripts/deploy-guard.mjs, for production.
import { bindings, defineConfig } from 'cf/config'
import { readWrangler, resources } from './scripts/cloudflare.mjs'

const wrangler = readWrangler('.')

export default defineConfig((ctx) => {
  const mode = ctx.mode === 'preview' ? 'preview' : 'production'
  const { name, d1, kv, vars } = resources(wrangler, mode)
  const scope = mode === 'production' ? wrangler : wrangler.env.preview
  // Only a production deploy, inside a Workers Builds build of main, carries the marker the
  // production Worker checks. A stray DEPLOYED_FROM anywhere else is ignored.
  const deployed: Record<string, ReturnType<typeof bindings.text>> = {}
  const env = process.env
  if (mode === 'production' && env.DEPLOYED_FROM === 'main' && env.WORKERS_CI === '1' && env.WORKERS_CI_BRANCH === 'main') {
    deployed.DEPLOYED_FROM = bindings.text('main')
    deployed.DEPLOYED_COMMIT = bindings.text(env.DEPLOYED_COMMIT ?? 'unknown')
  }
  return {
    worker: {
      name,
      entrypoint: wrangler.main,
      compatibilityDate: wrangler.compatibility_date,
      compatibilityFlags: wrangler.compatibility_flags,
      observability: wrangler.observability,
      env: {
        ...Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, bindings.text(String(v))])),
        ...deployed,
        DB: bindings.d1({ name: scope.d1_databases[0].database_name, id: d1 }),
        KV: bindings.kv({ id: kv }),
        [wrangler.assets.binding]: bindings.assets(),
      },
    },
  }
})
