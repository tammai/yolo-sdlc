#!/usr/bin/env node
// Lints the behaviour scenarios' grader patterns. A pattern that silently never matches makes a
// "must not" grader pass vacuously, so these are checked on every push (CI):
//   - it compiles
//   - it holds no control characters (a "\b" written through a shell can arrive as a backspace)
//   - it doesn't look like an escape was lost ("status:s*agreed" where "status:\s*agreed" was meant)
//   node evals/lint-scenarios.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const scenarios = JSON.parse(readFileSync(join(here, 'behavior', 'scenarios.json'), 'utf8'))
const problems = []
for (const s of scenarios) {
  for (const g of s.graders) {
    for (const key of ['regex', 'match']) {
      const src = g[key]
      if (src === undefined) continue
      const where = `${s.id}: ${g.type}.${key} ${JSON.stringify(src)}`
      try {
        new RegExp(src.startsWith('(?i)') ? src.slice(4) : src)
      } catch (err) {
        problems.push(`${where} doesn't compile (${err.message})`)
      }
      if (/[\u0000-\u001f]/.test(src)) problems.push(`${where} holds a control character (a lost escape?)`)
      if (/(?<!\\)[:(]s[*+]/.test(src)) problems.push(`${where} has a bare "s*" or "s+" (did "\\s" lose its backslash?)`)
    }
  }
}
if (problems.length) {
  for (const p of problems) console.error(`✋ ${p}`)
  process.exit(1)
}
console.log(`${scenarios.length} behaviour scenarios: grader patterns ok`)
