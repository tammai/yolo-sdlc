// Config for Cloudflare's `cf` CLI (deploys, previews). Engineer-owned (red tier).
// It holds no settings of its own: every name, ID and var comes from wrangler.jsonc, which
// `nuxt dev` also reads for local bindings, so the two can't drift. Fill in wrangler.jsonc.
//   cf deploy               → the production Worker (top level of wrangler.jsonc)
//   cf deploy --mode preview → "<name>-preview" (env.preview), with its own D1 and KV
// DEPLOYED_FROM / DEPLOYED_COMMIT are set only by scripts/deploy-guard.mjs, from its environment.
import { bindings, defineConfig } from 'cf/config'
import { readWrangler, resources } from './scripts/cloudflare.mjs'

const wrangler = readWrangler('.')

export default defineConfig((ctx) => {
  const mode = ctx.mode === 'preview' ? 'preview' : 'production'
  const { name, d1, kv, vars } = resources(wrangler, mode)
  const scope = mode === 'production' ? wrangler : wrangler.env.preview
  const deployed: Record<string, ReturnType<typeof bindings.text>> = {}
  if (process.env.DEPLOYED_FROM) {
    deployed.DEPLOYED_FROM = bindings.text(process.env.DEPLOYED_FROM)
    deployed.DEPLOYED_COMMIT = bindings.text(process.env.DEPLOYED_COMMIT ?? 'unknown')
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
