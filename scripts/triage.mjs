#!/usr/bin/env node
// /yolo-sdlc:triage. The Maintain loop: problem reports from the live app that no intent has
// picked up yet. Reads the live database with one fixed, read-only query (engineers only),
// leaves out reports already listed in an intent's `reports:` field, and prints the rest as
// JSON for Claude to group into draft intents.
//   node triage.mjs [appDir] [--from reports.json]
// Reporter emails are never read: an intent must not name people.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { frontmatter } from './report.mjs'

export const QUERY = "SELECT id, message, page, created_at FROM feedback WHERE status = 'new' ORDER BY id"

// Report ids an intent already covers: `reports: 3, 5` in its frontmatter.
export function referencedIds(intentTexts) {
  const ids = new Set()
  for (const text of intentTexts) {
    for (const m of (frontmatter(text).reports ?? '').matchAll(/\d+/g)) ids.add(Number(m[0]))
  }
  return ids
}

// `cf d1 query` prints the API's [{ results: [...], success, meta }], possibly still wrapped as
// { result: [...] }. Older saved exports (`wrangler d1 execute --json`) have the same inner shape.
export function rowsFrom(json) {
  let parsed = typeof json === 'string' ? JSON.parse(json) : json
  if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.result)) parsed = parsed.result
  return Array.isArray(parsed) ? parsed.flatMap((r) => r.results ?? (r.id != null ? [r] : [])) : []
}

export function pending(rows, covered) {
  return rows
    .filter((r) => !covered.has(Number(r.id)))
    .map((r) => ({
      id: Number(r.id),
      message: String(r.message ?? '').slice(0, 2000),
      page: r.page ?? null,
      date: r.created_at ? new Date(Number(r.created_at) * 1000).toISOString().slice(0, 10) : null,
    }))
}

function intentTexts(app) {
  const dir = join(app, 'intent')
  return existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith('.md') && f !== '_template.md').map((f) => readFileSync(join(dir, f), 'utf8'))
    : []
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2)
  const from = args.includes('--from') ? args[args.indexOf('--from') + 1] : null
  const app = resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--from') ?? process.cwd())
  let raw
  if (from) {
    raw = readFileSync(from, 'utf8')
  } else {
    if (process.env.RISK_TIER_ROLE !== 'engineer') {
      console.error('Reading problem reports from the live app is for engineers (RISK_TIER_ROLE=engineer). Ask an engineer to run /yolo-sdlc:triage.')
      process.exit(2)
    }
    if (process.env.YOLO_SDLC_REPORTS) {
      // Test seam: the plugin's behaviour evals point this at a saved `cf d1 query` result, so an
      // eval never reads a live database. Unset everywhere else.
      raw = readFileSync(process.env.YOLO_SDLC_REPORTS, 'utf8')
    } else {
      // The app's pinned cf, by the production database's ID (cf takes IDs, not names).
      const helper = join(app, 'scripts', 'cloudflare.mjs')
      if (!existsSync(helper)) {
        console.error("This app predates the move to Cloudflare's cf CLI (yolo-sdlc 0.4.6). Run /yolo-sdlc:update-app first.")
        process.exit(2)
      }
      try {
        const { readWrangler, databaseId, runCf } = await import(pathToFileURL(helper).href)
        raw = runCf(['d1', 'query', databaseId(readWrangler(app)), '--sql', QUERY], { app, capture: true })
      } catch (err) {
        console.error(err.message)
        process.exit(2)
      }
    }
  }
  const rows = rowsFrom(raw)
  const covered = referencedIds(intentTexts(app))
  console.log(JSON.stringify({ total: rows.length, alreadyCovered: rows.length - pending(rows, covered).length, reports: pending(rows, covered) }, null, 2))
}
