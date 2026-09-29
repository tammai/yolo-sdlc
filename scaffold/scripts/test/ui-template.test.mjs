import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { layerHash } from '../ui-template.mjs'

// The templates themselves live in the yolo-sdlc plugin, which tests installing them. Here: the
// installed shell must be exactly what was installed, so changes to it go through the plugin.
const repo = fileURLToPath(new URL('../../', import.meta.url))

test('the installed layers/ui matches the template it was installed from (no hand edits)', () => {
  const info = JSON.parse(readFileSync(join(repo, 'layers/ui/.template.json'), 'utf8'))
  assert.ok(info.hash, 'layers/ui/.template.json has no fingerprint: reinstall it with /yolo-sdlc:update-app')
  assert.equal(layerHash(join(repo, 'layers/ui')), info.hash, 'layers/ui/ was edited by hand: copy a page into app/pages/ and edit the copy instead')
})
