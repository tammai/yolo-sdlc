#!/usr/bin/env node
// Installs a UI template: `pnpm ui:template [starter|dashboard|landing] --from <templates-dir>`.
// Engineer-owned (red tier).
//
// Templates live in the yolo-sdlc plugin (scaffold/ui-templates/<name>/), not in the app: pass
// `--from "<plugin>/scaffold/ui-templates"` (/yolo-sdlc:new-app and /yolo-sdlc:update-app do). An
// older app that still has its own ui-templates/ folder works without --from. Each template is
// curated from github.com/nuxt-ui-templates at the commit named in its manifest.json:
//   layer/  → becomes layers/ui/, a Nuxt layer (layout, shell components, starting pages)
//   root/   → copied into the project root, but never over a file that already exists (e.g. content/)
//   manifest.json "dependencies" → added to package.json. Other templates' dependencies are removed.
//
// With no name it installs the template that matches app.registry.json "type":
// internal → dashboard, public → landing, prototype → starter.

import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

export const TEMPLATE_FOR_TYPE = { internal: 'dashboard', public: 'landing', prototype: 'starter' }

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n')

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

// A fingerprint of a layer's files (paths and contents, line endings ignored), stored in
// layers/ui/.template.json, so a check can tell if anyone hand-edited the installed shell.
export function layerHash(dir) {
  const h = createHash('sha256')
  const files = walk(dir)
    .map((p) => relative(dir, p).split('\\').join('/'))
    .filter((p) => p !== '.template.json')
    .sort()
  for (const file of files) h.update(file + '\0' + readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n') + '\0')
  return h.digest('hex')
}

export function installTemplate(root, requested, from) {
  const templatesDir = from ?? join(root, 'ui-templates')
  if (!existsSync(templatesDir)) {
    throw new Error(
      'The UI templates come from the yolo-sdlc plugin: node scripts/ui-template.mjs <name> --from "<plugin>/scaffold/ui-templates" (/yolo-sdlc:update-app runs this for you).',
    )
  }
  const available = readdirSync(templatesDir).filter((n) => existsSync(join(templatesDir, n, 'manifest.json')))
  const registry = existsSync(join(root, 'app.registry.json')) ? readJson(join(root, 'app.registry.json')) : {}
  const name = requested ?? TEMPLATE_FOR_TYPE[registry.type]
  if (!name || !available.includes(name)) {
    throw new Error(`Unknown template "${name}". Choose one of: ${available.join(', ')}`)
  }
  const manifests = Object.fromEntries(available.map((n) => [n, readJson(join(templatesDir, n, 'manifest.json'))]))
  const manifest = manifests[name]

  // 1. The layer: replaced wholesale, so nothing from the previous template lingers.
  const layer = join(root, 'layers', 'ui')
  rmSync(layer, { recursive: true, force: true })
  mkdirSync(dirname(layer), { recursive: true })
  cpSync(join(templatesDir, name, 'layer'), layer, { recursive: true })
  writeJson(join(layer, '.template.json'), { name, source: manifest.source, hash: layerHash(layer) })

  // 2. Root files (content, its schema): added once, never overwritten, because people edit them.
  const added = []
  const kept = []
  const rootSrc = join(templatesDir, name, 'root')
  if (existsSync(rootSrc)) {
    for (const src of walk(rootSrc)) {
      const rel = relative(rootSrc, src)
      const dest = join(root, rel)
      if (existsSync(dest)) {
        kept.push(rel)
        continue
      }
      mkdirSync(dirname(dest), { recursive: true })
      cpSync(src, dest)
      added.push(rel)
    }
  }

  // 3. Dependencies: this template's in, every other template's out.
  const pkgPath = join(root, 'package.json')
  const pkg = readJson(pkgPath)
  const others = new Set(
    Object.entries(manifests)
      .filter(([n]) => n !== name)
      .flatMap(([, m]) => Object.keys(m.dependencies ?? {})),
  )
  for (const dep of others) if (!(dep in (manifest.dependencies ?? {}))) delete pkg.dependencies[dep]
  Object.assign(pkg.dependencies, manifest.dependencies ?? {})
  pkg.dependencies = Object.fromEntries(Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)))
  writeJson(pkgPath, pkg)

  return { name, added, kept, dependencies: Object.keys(manifest.dependencies ?? {}) }
}

// `<name>` and `--from <dir>`, in any order.
export function parseArgs(argv) {
  const at = argv.indexOf('--from')
  const from = at >= 0 ? argv[at + 1] : undefined
  const name = argv.find((a, i) => !a.startsWith('--') && (at < 0 || i !== at + 1))
  return { name, from }
}

function main() {
  const { name, from } = parseArgs(process.argv.slice(2))
  const result = installTemplate(process.cwd(), name, from)
  console.log(`Installed the "${result.name}" UI template into layers/ui/.`)
  if (result.added.length) console.log(`Added: ${result.added.join(', ')}`)
  if (result.kept.length) console.log(`Kept existing (not overwritten): ${result.kept.join(', ')}`)
  console.log('Next: pnpm install && pnpm check')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main()
  } catch (err) {
    console.error(`✋ ${err.message}`)
    process.exit(1)
  }
}
