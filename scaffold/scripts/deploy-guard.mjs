#!/usr/bin/env node
// Deploys, and the only way to run one: `pnpm deploy:production` and `pnpm deploy:preview`,
// called by Cloudflare Workers Builds.
//
// Production refuses unless the build is of `main`, then applies migrations and deploys with
// DEPLOYED_FROM=main, which the production Worker checks at runtime
// (server/middleware/0.deploy-guard.ts). A version deployed any other way (a laptop, a
// misconfigured build) switches itself off instead of serving traffic.
// Preview deploys "<name>-preview" with its own database, from any branch.
//
// The upload is Wrangler's (`wrangler deploy`, reading wrangler.jsonc). Cloudflare's `cf` CLI
// 1.0.0-beta.5 can't deploy a Nuxt build yet: it hands the build to Nuxt and then refuses
// (tested on 2026-09-29: "`pnpm nuxt build` does not currently support `--mode`";
// cloudflare/cf#17, #18). Migrations go through `cf d1 migrations apply <database-id>`, which
// uses the same d1_migrations table as Wrangler. It goes to the live database and doesn't ask
// first when nobody is typing, which is why it runs only here, inside Workers Builds.
//
// Engineer-owned (red tier).

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { databaseId, kvNamespaceId, readWrangler, runCf, runWrangler } from './cloudflare.mjs'

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

// The calls for one deploy, exported for tests. A Wrangler dry run comes first, so a deploy that
// can't work fails before any live migration runs. `--env=""` is the top level (production);
// `--env preview` swaps in env.preview and deploys "<name>-preview". Only production carries
// DEPLOYED_FROM=main, as a --var of that one deploy.
export function deployPlan(mode, wrangler, commit) {
  const id = databaseId(wrangler, mode)
  kvNamespaceId(wrangler, mode)
  const envArgs = mode === 'production' ? ['--env='] : ['--env', mode]
  const marker = mode === 'production' ? ['--var', 'DEPLOYED_FROM:main', '--var', `DEPLOYED_COMMIT:${commit}`] : []
  return [
    { tool: 'wrangler', args: ['deploy', ...envArgs, '--dry-run'] },
    { tool: 'cf', args: ['d1', 'migrations', 'apply', id, '--dir', 'migrations'] },
    { tool: 'wrangler', args: ['deploy', ...envArgs, ...marker] },
  ]
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
  // DEPLOY_GUARD_DRY_RUN=1: prove both tools start, deploy nothing (used by the tests).
  if (process.env.DEPLOY_GUARD_DRY_RUN === '1') {
    runCf(['--version'])
    return runWrangler(['--version'])
  }
  // A stray DEPLOYED_FROM in the build's own variables never reaches a deploy.
  const env = { ...process.env }
  delete env.DEPLOYED_FROM
  delete env.DEPLOYED_COMMIT
  for (const step of deployPlan(mode, readWrangler('.'), commit)) {
    ;(step.tool === 'cf' ? runCf : runWrangler)(step.args, { env })
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main()
  } catch (err) {
    console.error(`\n✋ ${err.message}\n`)
    process.exit(1)
  }
}
