// Build tooling for `cf`, which hands a Nitro-built Worker to Wrangler's bundler.
// Engineer-owned (red tier). The assets folder comes from wrangler.jsonc, like everything else.
import { defineWranglerConfig } from 'wrangler/experimental-config'
import { readWrangler } from './scripts/cloudflare.mjs'

export default defineWranglerConfig({
  types: { generate: false },
  assetsDirectory: readWrangler('.').assets.directory,
})
