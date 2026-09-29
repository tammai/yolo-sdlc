import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { installTemplate, layerHash, parseArgs, TEMPLATE_FOR_TYPE } from '../../scaffold/scripts/ui-template.mjs'

// The UI templates live in the plugin (scaffold/ui-templates/); apps get only the installed shell.
const templates = fileURLToPath(new URL('../../scaffold/ui-templates/', import.meta.url))
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

function sandbox(type = 'internal') {
  const dir = mkdtempSync(join(tmpdir(), 'ui-template-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { nuxt: '^4', '@nuxt/ui': '^4' } }))
  writeFileSync(join(dir, 'app.registry.json'), JSON.stringify({ type }))
  return dir
}

test('every template has a manifest pinned to a commit and a layer', () => {
  for (const name of Object.values(TEMPLATE_FOR_TYPE)) {
    const m = readJson(join(templates, name, 'manifest.json'))
    assert.equal(m.name, name)
    assert.match(m.source.commit, /^[0-9a-f]{40}$/)
    assert.ok(existsSync(join(templates, name, 'layer', 'app', 'layouts', 'default.vue')))
  }
})

test('picks the template from the app type, replaces the layer wholesale, and records a fingerprint', () => {
  const dir = sandbox('internal')
  try {
    assert.equal(installTemplate(dir, undefined, templates).name, 'dashboard')
    assert.ok(existsSync(join(dir, 'layers/ui/app/components/UserMenu.vue')))
    const info = readJson(join(dir, 'layers/ui/.template.json'))
    assert.equal(info.hash, layerHash(join(dir, 'layers/ui')))
    installTemplate(dir, 'starter', templates)
    assert.ok(!existsSync(join(dir, 'layers/ui/app/components/UserMenu.vue')), 'nothing lingers from the previous template')
    assert.equal(readJson(join(dir, 'layers/ui/.template.json')).name, 'starter')
    writeFileSync(join(dir, 'layers/ui/app/layouts/default.vue'), '<template>edited</template>\n')
    assert.notEqual(layerHash(join(dir, 'layers/ui')), readJson(join(dir, 'layers/ui/.template.json')).hash, 'a hand edit changes the fingerprint')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('landing adds @nuxt/content and its content; switching away removes the dependency but keeps edited content', () => {
  const dir = sandbox('public')
  try {
    assert.equal(installTemplate(dir, undefined, templates).name, 'landing')
    assert.ok(readJson(join(dir, 'package.json')).dependencies['@nuxt/content'])
    writeFileSync(join(dir, 'content/landing.yml'), 'title: Edited by marketing\n')
    assert.deepEqual(installTemplate(dir, 'landing', templates).kept.sort(), ['content.config.ts', join('content', 'landing.yml')].sort())
    assert.equal(readFileSync(join(dir, 'content/landing.yml'), 'utf8'), 'title: Edited by marketing\n')
    installTemplate(dir, 'dashboard', templates)
    assert.equal(readJson(join(dir, 'package.json')).dependencies['@nuxt/content'], undefined)
    assert.equal(readJson(join(dir, 'package.json')).dependencies.nuxt, '^4')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('refuses an unknown template, and says where templates come from when none are given', () => {
  const dir = sandbox()
  try {
    assert.throws(() => installTemplate(dir, 'saas', templates), /Unknown template/)
    assert.throws(() => installTemplate(dir, 'dashboard'), /come from the yolo-sdlc plugin/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('parseArgs: the name and --from in any order', () => {
  assert.deepEqual(parseArgs(['dashboard', '--from', '/t']), { name: 'dashboard', from: '/t' })
  assert.deepEqual(parseArgs(['--from', '/t', 'landing']), { name: 'landing', from: '/t' })
  assert.deepEqual(parseArgs([]), { name: undefined, from: undefined })
})

test("the scaffold's installed shell matches its template and fingerprint", () => {
  const layer = fileURLToPath(new URL('../../scaffold/layers/ui/', import.meta.url))
  const info = readJson(join(layer, '.template.json'))
  assert.equal(info.hash, layerHash(layer))
  const dir = sandbox()
  try {
    installTemplate(dir, info.name, templates)
    assert.equal(layerHash(join(dir, 'layers/ui')), info.hash, 'scaffold/layers/ui differs from its template')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
