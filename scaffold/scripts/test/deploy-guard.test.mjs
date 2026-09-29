import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkPreviewDeploy, checkProductionDeploy, deployPlan } from '../deploy-guard.mjs'

const ci = (branch, extra = {}) => ({ WORKERS_CI: '1', WORKERS_CI_BRANCH: branch, WORKERS_CI_COMMIT_SHA: 'abc123', ...extra })
const app = { type: 'internal' }

test('deploys a Workers Builds build of main', () => {
  assert.deepEqual(checkProductionDeploy(ci('main'), app), { ok: true, commit: 'abc123' })
})

test('refuses any other branch, naming it', () => {
  const v = checkProductionDeploy(ci('feature/leave-tracker'), app)
  assert.equal(v.ok, false)
  assert.match(v.reason, /feature\/leave-tracker/)
})

test('refuses outside Workers Builds, even on main', () => {
  assert.equal(checkProductionDeploy({ WORKERS_CI_BRANCH: 'main' }, app).ok, false)
  assert.equal(checkProductionDeploy({}, app).ok, false)
})

test('refuses when the branch is unknown', () => {
  assert.equal(checkProductionDeploy({ WORKERS_CI: '1' }, app).ok, false)
})

test('prototypes never deploy to production', () => {
  const v = checkProductionDeploy(ci('main'), { type: 'prototype' })
  assert.equal(v.ok, false)
  assert.match(v.reason, /prototype/)
})

const ID = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0'
const PREVIEW_ID = '1f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0'
const KV = '2d78eb488e3845a88ec92455864499bd'
const wrangler = {
  name: 'app',
  d1_databases: [{ database_id: ID }],
  kv_namespaces: [{ id: KV }],
  env: { preview: { d1_databases: [{ database_id: PREVIEW_ID }], kv_namespaces: [{ id: KV }] } },
}

test('production: a dry run first, then migrations by ID, then cf deploy with DEPLOYED_FROM=main', () => {
  const plan = deployPlan('production', wrangler, 'abc123', { PATH: 'x' })
  assert.deepEqual(plan.steps, [
    ['deploy', '--dry-run'],
    ['d1', 'migrations', 'apply', ID, '--dir', 'migrations'],
    ['deploy', '--message', 'production @ abc123'],
  ])
  assert.deepEqual(plan.env, { PATH: 'x', DEPLOYED_FROM: 'main', DEPLOYED_COMMIT: 'abc123' })
})

test('preview: its own database, --mode preview, and a stray DEPLOYED_FROM is removed', () => {
  const plan = deployPlan('preview', wrangler, 'abc123', { PATH: 'x', DEPLOYED_FROM: 'main', DEPLOYED_COMMIT: 'z' })
  assert.deepEqual(plan.steps[0], ['deploy', '--mode', 'preview', '--dry-run'])
  assert.equal(plan.steps[1][3], PREVIEW_ID)
  assert.deepEqual(plan.steps[2].slice(0, 3), ['deploy', '--mode', 'preview'])
  assert.deepEqual(plan.env, { PATH: 'x' })
})

test('preview deploys run only inside Workers Builds', () => {
  assert.equal(checkPreviewDeploy({}).ok, false)
  assert.deepEqual(checkPreviewDeploy({ WORKERS_CI: '1', WORKERS_CI_COMMIT_SHA: 'abc' }), { ok: true, commit: 'abc' })
})

test('an ID that is still TODO stops the deploy in plain words, before anything runs', () => {
  assert.throws(() => deployPlan('production', { name: 'app', d1_databases: [{ database_id: 'TODO-d1-database-id' }] }, 'x'), /D1 database ID .* isn't set yet/)
  assert.throws(() => deployPlan('production', { ...wrangler, kv_namespaces: [{ id: 'TODO-kv-namespace-id' }] }, 'x'), /KV namespace ID .* isn't set yet/)
})

test('the deploy step can actually start cf (dry run, deploys nothing)', () => {
  const script = fileURLToPath(new URL('../deploy-guard.mjs', import.meta.url))
  const run = (env) =>
    spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, WORKERS_CI: '', WORKERS_CI_BRANCH: '', ...env } })
  const refused = run({})
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /refused/)
  const preview = spawnSync(process.execPath, [script, 'preview'], { encoding: 'utf8', env: { ...process.env, WORKERS_CI: '' } })
  assert.equal(preview.status, 1)
  assert.match(preview.stderr, /Preview deploy refused/)
  const ok = run({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main', WORKERS_CI_COMMIT_SHA: 'abc123', DEPLOY_GUARD_DRY_RUN: '1' })
  assert.equal(ok.status, 0, ok.stderr)
  assert.match(ok.stdout, /Deploying main @ abc123/)
  assert.match(ok.stdout, /\d+\.\d+\.\d+/) // cf printed its version
})
