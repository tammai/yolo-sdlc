#!/usr/bin/env node
// /yolo-sdlc:new-app. Creates a new app from scaffold/:
//   node new-app.mjs <dir> --name <kebab-name> --type <internal|public|prototype> --data <public|internal|personal>
//                    [--owner <github-handle>] [--description "<one sentence>"]   (owner defaults to the signed-in gh account)
// Copies the scaffold, fills in the app's name and type, installs the matching UI template,
// and makes the first git commit. Engineer setup (Cloudflare, GitHub) follows docs/SETUP.md.

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCAFFOLD = join(PLUGIN_ROOT, 'scaffold')
const SKIP = new Set(['node_modules', '.nuxt', '.output', '.wrangler', '.data', 'test-results', 'playwright-report', '.git'])
const TYPES = ['internal', 'public', 'prototype']
const DATA = ['public', 'internal', 'personal']

export const pluginVersion = () => JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version

const titleCase = (name) => name.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')

function replaceIn(file, pairs) {
  let s = readFileSync(file, 'utf8')
  for (const [a, b] of pairs) {
    if (!s.includes(a)) throw new Error(`${basename(file)}: expected to find ${JSON.stringify(a)}`)
    s = s.split(a).join(b)
  }
  writeFileSync(file, s)
}

// Six months from today: when the app's owner and reviewers should be confirmed again.
const sixMonthsOn = (from = new Date()) => {
  const d = new Date(from)
  d.setMonth(d.getMonth() + 6)
  return d.toISOString().slice(0, 10)
}

// The signed-in GitHub account, as the default owner. Null when gh isn't signed in.
export function githubLogin() {
  try {
    return execFileSync('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20_000 }).trim() || null
  } catch {
    return null
  }
}

export function createApp(dir, { name, type, data, owner, description, git = true }) {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(name ?? '')) throw new Error('name must be lowercase letters, digits and dashes, e.g. leave-tracker')
  if (!TYPES.includes(type)) throw new Error(`type must be one of: ${TYPES.join(', ')}`)
  if (!DATA.includes(data)) throw new Error(`data must be one of: ${DATA.join(', ')}`)
  const target = resolve(dir)
  if (existsSync(target) && readdirSync(target).length) throw new Error(`${target} already exists and isn't empty`)
  mkdirSync(target, { recursive: true })

  cpSync(SCAFFOLD, target, { recursive: true, filter: (src) => !SKIP.has(basename(src)) })

  replaceIn(join(target, 'wrangler.jsonc'), [
    ['"todo-app-name', `"${name}`],
    ['"APP_TYPE": "internal"', `"APP_TYPE": "${type}"`],
  ])
  const regPath = join(target, 'app.registry.json')
  const reg = JSON.parse(readFileSync(regPath, 'utf8'))
  Object.assign(reg, { name, type, data, reviewBy: sixMonthsOn() })
  if (description) reg.description = description
  // The owner reviews yellow; red needs a second engineer, which only a person can name.
  if (owner) {
    if (!/^[A-Za-z0-9-]{1,39}$/.test(owner)) throw new Error('owner must be a GitHub handle')
    Object.assign(reg, { owner, reviewers: { yellow: [owner], red: [owner, 'TODO-second-engineer-handle'] } })
  }
  reg.urls = { production: `https://${name}.TODO-subdomain.workers.dev`, preview: `https://${name}-preview.TODO-subdomain.workers.dev` }
  writeFileSync(regPath, JSON.stringify(reg, null, 2) + '\n')
  replaceIn(join(target, 'app/app.config.ts'), [["name: 'New app'", `name: '${titleCase(name)}'`]])
  const pkgPath = join(target, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  pkg.name = name
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

  // The UI shell for this type (dashboard / landing / starter), with its dependencies and content.
  execFileSync(process.execPath, [join(target, 'scripts', 'ui-template.mjs')], { cwd: target, stdio: 'ignore' })

  writeFileSync(join(target, '.yolo-sdlc.json'), JSON.stringify({ plugin: 'yolo-sdlc', version: pluginVersion() }, null, 2) + '\n')

  if (git) {
    const g = (...args) => execFileSync('git', args, { cwd: target, stdio: 'ignore' })
    g('init', '-q', '-b', 'main')
    g('add', '-A')
    g('commit', '-q', '-m', `Start ${name} from yolo-sdlc ${pluginVersion()}`)
  }
  return { target, template: JSON.parse(readFileSync(join(target, 'layers/ui/.template.json'), 'utf8')).name }
}

function parseArgs(argv) {
  const out = { dir: argv[0] }
  for (let i = 1; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1]
  return out
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { dir, name, type, data, owner, description } = parseArgs(process.argv.slice(2))
  try {
    if (!dir) throw new Error('Usage: new-app.mjs <dir> --name <name> --type <internal|public|prototype> --data <public|internal|personal> [--owner <github-handle>] [--description "<one sentence>"]')
    const who = owner ?? githubLogin()
    const { target, template } = createApp(dir, { name, type, data, owner: who ?? undefined, description })
    console.log(`Created ${name} (${type}, ${template} UI) at ${target}`)
    console.log(who ? `Owner and yellow reviewer: ${who}. Name a second engineer under reviewers.red in app.registry.json.` : 'No owner set (gh is not signed in): fill in owner and reviewers in app.registry.json.')
    console.log('Next: cd into it, run `pnpm install`, then follow docs/SETUP.md (Cloudflare, GitHub, branch rules).')
  } catch (err) {
    console.error(`✋ ${err.message}`)
    process.exit(1)
  }
}
