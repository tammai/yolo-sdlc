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
import { databaseId, readWrangler, runCf } from './cloudflare.mjs'

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

// The cf calls for one deploy, exported for tests. cloudflare.config.ts reads DEPLOYED_FROM and
// DEPLOYED_COMMIT from the environment; nothing else sets them.
export function deployPlan(mode, wrangler, commit) {
  const id = databaseId(wrangler, mode)
  const modeArgs = mode === 'production' ? [] : ['--mode', mode]
  return {
    steps: [
      ['d1', 'migrations', 'apply', id, '--dir', 'migrations'],
      ['deploy', ...modeArgs, '--message', `${mode} @ ${commit}`],
    ],
    env: mode === 'production' ? { DEPLOYED_FROM: 'main', DEPLOYED_COMMIT: commit } : {},
  }
}

function main() {
  const mode = process.argv[2] === 'preview' ? 'preview' : 'production'
  const registry = JSON.parse(readFileSync('app.registry.json', 'utf8'))
  let commit = process.env.WORKERS_CI_COMMIT_SHA ?? 'unknown'
  if (mode === 'production') {
    const verdict = checkProductionDeploy(process.env, registry)
    if (!verdict.ok) {
      console.error(`\n✋ Production deploy refused: ${verdict.reason}\n`)
      process.exit(1)
    }
    commit = verdict.commit
  }
  console.log(`Deploying ${mode === 'production' ? 'main' : (process.env.WORKERS_CI_BRANCH ?? 'this branch')} @ ${commit} to ${mode}.`)
  // DEPLOY_GUARD_DRY_RUN=1: prove cf starts, deploy nothing (used by the tests).
  if (process.env.DEPLOY_GUARD_DRY_RUN === '1') return runCf(['--version'])
  let plan
  try {
    plan = deployPlan(mode, readWrangler('.'), commit)
  } catch (err) {
    console.error(`\n✋ ${err.message}\n`)
    process.exit(1)
  }
  for (const step of plan.steps) runCf(step, { env: { ...process.env, ...plan.env } })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
