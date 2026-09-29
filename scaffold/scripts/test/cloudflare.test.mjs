import assert from 'node:assert/strict'
import { test } from 'node:test'
import { databaseId, parseJsonc, readWrangler, resources } from '../cloudflare.mjs'

const ID = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0'

test('parseJsonc: comments and trailing commas go, comment markers inside strings stay', () => {
  const v = parseJsonc('{\n  // a comment\n  "url": "https://x.dev/a", /* block */ "list": [1, 2,],\n}')
  assert.deepEqual(v, { url: 'https://x.dev/a', list: [1, 2] })
  assert.deepEqual(parseJsonc('{"s": "quote \\" // not a comment"}'), { s: 'quote " // not a comment' })
})

test('parseJsonc: ",}" and ",]" inside strings are kept; a BOM is fine; an open /* is an error', () => {
  assert.deepEqual(parseJsonc('{"a": "x,}", "b": "[1,]", "c": [1, 2 , ] , }'), { a: 'x,}', b: '[1,]', c: [1, 2] })
  assert.deepEqual(parseJsonc('﻿{"a": 1}'), { a: 1 })
  assert.throws(() => parseJsonc('{"a": 1} /* oops'), /never ends/)
  assert.throws(() => parseJsonc('{"a": 1,,}'))
})

test("the scaffold's own wrangler.jsonc parses, with production and preview resources", () => {
  const config = readWrangler('.')
  const prod = resources(config)
  const preview = resources(config, 'preview')
  assert.equal(prod.name, config.name)
  assert.equal(preview.name, `${config.name}-preview`)
  assert.equal(prod.vars.DEPLOY_ENV, 'production')
  assert.equal(preview.vars.DEPLOY_ENV, 'preview')
})

test('databaseId: a real ID passes, a TODO placeholder is refused in plain words', () => {
  const config = { name: 'a', d1_databases: [{ database_id: ID }], env: { preview: { d1_databases: [{ database_id: 'TODO-preview-d1-database-id' }] } } }
  assert.equal(databaseId(config), ID)
  assert.throws(() => databaseId(config, 'preview'), /preview D1 database ID in wrangler\.jsonc isn't set yet/)
  assert.throws(() => resources(config, 'staging'), /no env\.staging/)
})
