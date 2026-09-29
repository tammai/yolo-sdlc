// Shared by the scripts that call Cloudflare's `cf` CLI (deploy-guard.mjs, the plugin's triage):
// the resource IDs from wrangler.jsonc, and the project's pinned `cf`, run by node directly.
// wrangler.jsonc stays the one place IDs are written: `nuxt dev` reads it for local bindings,
// and cloudflare.config.ts reads it for `cf`. `cf` accepts database IDs, never names.
//
// Engineer-owned (red tier).

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// JSON with // and /* */ comments and trailing commas. Comment markers inside strings are kept.
export function parseJsonc(text) {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2)
      if (i === -1) break
      i++
    } else out += c
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'))
}

export const readWrangler = (app = '.') => parseJsonc(readFileSync(join(app, 'wrangler.jsonc'), 'utf8'))

// mode: 'production' (the top level) or 'preview' (env.preview).
export function resources(config, mode = 'production') {
  const scope = mode === 'production' ? config : config.env?.[mode]
  if (!scope) throw new Error(`wrangler.jsonc has no env.${mode}`)
  const name = mode === 'production' ? config.name : `${config.name}-${mode}`
  return { name, d1: scope.d1_databases?.[0]?.database_id, kv: scope.kv_namespaces?.[0]?.id, vars: scope.vars ?? {} }
}

const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i
export function databaseId(config, mode = 'production') {
  const id = resources(config, mode).d1
  if (!id || !UUID.test(id)) {
    throw new Error(`The ${mode} D1 database ID in wrangler.jsonc isn't set yet ("${id ?? ''}"). An engineer fills it in (docs/SETUP.md §2).`)
  }
  return id
}

// The app's pinned `cf`, from its package's own bin entry: no shell, so arguments such as a SQL
// query stay one argument on Windows too.
export function cfEntry(app = '.') {
  const pkgPath = join(app, 'node_modules', 'cf', 'package.json')
  if (!existsSync(pkgPath)) throw new Error('cf is not installed in this app. Run pnpm install first.')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const bin = typeof pkg.bin === 'string' ? pkg.bin : (pkg.bin?.cf ?? Object.values(pkg.bin ?? {})[0])
  if (!bin) throw new Error("cf's package.json has no bin entry")
  return join(dirname(pkgPath), bin)
}

export function runCf(args, { app = '.', env = process.env, capture = false } = {}) {
  if (!capture) console.log(`$ cf ${args.join(' ')}`)
  const res = spawnSync(process.execPath, [cfEntry(app), ...args], {
    cwd: app,
    env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  })
  if (res.status !== 0) {
    if (capture) throw new Error(`cf ${args[0]} ${args[1] ?? ''} failed (exit ${res.status})`)
    process.exit(res.status ?? 1)
  }
  return res.stdout
}
