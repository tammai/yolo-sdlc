#!/usr/bin/env node
// Deploys, and the only way to run one: `pnpm deploy:production` and `pnpm deploy:preview`,
// called by Cloudflare Workers Builds. Both go through Cloudflare's `cf` CLI.
//
// Production refuses unless the build is of `main`, then applies migrations and deploys with
// DEPLOYED_FROM=main, which the production Worker checks at runtime
// (server/middleware/0.deploy-guard.ts). A version deployed any other way (a laptop, a
// misconfigured build) switches itself off instead of serving traffic.
// Preview deploys "<name>-preview" with its own database, from any branch.
//
// `cf` takes database IDs, not names, so they're read from wrangler.jsonc (scripts/cloudflare.mjs).
// `cf d1 migrations apply` goes to the live database and doesn't ask first when nobody is typing,
// which is why it runs only here, inside Workers Builds.
//
// Engineer-owned (red tier).

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { databaseId, kvNamespaceId, readWrangler, resources, runCf } from './cloudflare.mjs'

// Pure decision, exported for tests. `env` is process.env-shaped.
export function checkProductionDeploy(env, registry) {
  if (env.WORKERS_CI !== '1') {
    return { ok: false, reason: 'Production deploys run only inside Cloudflare Workers Builds, never from a laptop.' }
  }
  if (registry?.type === 'prototype') {
    return { ok: false, reason: 'This app is registered as a prototype. Prototypes live on the preview only.' }
  }
  if (env.WORKERS_CI_BRANCH !== 'main') {
    return {
      ok: false,
      reason: `This build is of "${env.WORKERS_CI_BRANCH ?? 'an unknown branch'}", not "main". Only reviewed, merged code goes to production. Turn off non-production builds on the production Worker (docs/SETUP.md §4).`,
    }
  }
  return { ok: true, commit: env.WORKERS_CI_COMMIT_SHA ?? 'unknown' }
}

// Preview deploys run only inside Workers Builds too, from any branch.
export function checkPreviewDeploy(env) {
  return env.WORKERS_CI === '1'
    ? { ok: true, commit: env.WORKERS_CI_COMMIT_SHA ?? 'unknown' }
    : { ok: false, reason: 'Preview deploys run only inside Cloudflare Workers Builds, never from a laptop or a session.' }
}

// The cf calls for one deploy, and the exact environment they get, exported for tests.
// A dry run comes first, so a deploy that can't work fails before any live migration runs.
// cloudflare.config.ts binds DEPLOYED_FROM only when it's set here, and only for production.
export function deployPlan(mode, wrangler, commit, baseEnv = {}) {
  const id = databaseId(wrangler, mode)
  kvNamespaceId(wrangler, mode)
  // The Worker is named explicitly, so a preview can never land on the production Worker even if
  // cf didn't pass the mode through to cloudflare.config.ts.
  const modeArgs = [...(mode === 'production' ? [] : ['--mode', mode]), '--worker', resources(wrangler, mode).name]
  // APP_DEPLOY_MODE lets cloudflare.config.ts refuse if cf's own mode disagrees.
  const env = { ...baseEnv, APP_DEPLOY_MODE: mode }
  delete env.DEPLOYED_FROM
  delete env.DEPLOYED_COMMIT
  if (mode === 'production') Object.assign(env, { DEPLOYED_FROM: 'main', DEPLOYED_COMMIT: commit })
  return {
    steps: [
      ['deploy', ...modeArgs, '--dry-run'],
      ['d1', 'migrations', 'apply', id, '--dir', 'migrations'],
      ['deploy', ...modeArgs, '--message', `${mode} @ ${commit}`],
    ],
    env,
  }
}

function main() {
  const mode = process.argv[2] === 'preview' ? 'preview' : 'production'
  const registry = JSON.parse(readFileSync('app.registry.json', 'utf8'))
  const verdict = mode === 'production' ? checkProductionDeploy(process.env, registry) : checkPreviewDeploy(process.env)
  if (!verdict.ok) {
    console.error(`\n✋ ${mode === 'production' ? 'Production' : 'Preview'} deploy refused: ${verdict.reason}\n`)
    process.exit(1)
  }
  const { commit } = verdict
  console.log(`Deploying ${mode === 'production' ? 'main' : (process.env.WORKERS_CI_BRANCH ?? 'this branch')} @ ${commit} to ${mode}.`)
  // DEPLOY_GUARD_DRY_RUN=1: prove cf starts, deploy nothing (used by the tests).
  if (process.env.DEPLOY_GUARD_DRY_RUN === '1') return runCf(['--version'])
  const plan = deployPlan(mode, readWrangler('.'), commit, process.env)
  for (const step of plan.steps) runCf(step, { env: plan.env })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main()
  } catch (err) {
    console.error(`\n✋ ${err.message}\n`)
    process.exit(1)
  }
}
