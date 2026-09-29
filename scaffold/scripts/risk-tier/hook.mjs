#!/usr/bin/env node
// Claude Code hook for the risk tiers.
//
//   node hook.mjs pre   — PreToolUse on Edit|Write|MultiEdit|NotebookEdit|Bash. Denies edits that
//                         hit a `block` rule (everyone) or a `protected` rule (unless
//                         RISK_TIER_ROLE=engineer), and Bash commands that deploy, touch live
//                         data or skip the review path. Fails closed: if this script errors, the
//                         call is denied.
//   node hook.mjs post  — PostToolUse on file edits. Re-classifies the whole branch and, when the
//                         tier changes, tells Claude so it can explain it to the user.
//
// The session hook is a convenience that catches problems early. The merge gate is CI
// (ci.mjs), which re-checks every change no matter how it was made.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import { classify, normalizePath } from './classify.mjs'
import { collectChanges, currentBranch, gitDir, isGitRepo, resolveBase } from './git.mjs'
import { formatForSession, formatNotice, rose } from './report.mjs'
import { validateReview } from './review-record.mjs'

const here = new URL('.', import.meta.url)
const config = JSON.parse(readFileSync(new URL('rules.json', here), 'utf8'))
const isEngineer = process.env.RISK_TIER_ROLE === 'engineer'

const TAIL = 'Explain this to the user in plain words. Do not look for another way to make this change.'

function emit(obj) {
  process.stdout.write(JSON.stringify(obj))
  process.exit(0)
}

const deny = (reason) =>
  emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })

// ---------- Bash ----------

const PROTECTED_IN_SHELL =
  /(?:>>?|\btee\b|\bsed\s+-i|\bmv\b|\bcp\b|\brm\b|\bgit\s+(?:checkout|restore)\b)[^\n|;&]*(?:\.github[\\/]|\.claude[\\/]|scripts[\\/]|layers[\\/]|ui-templates[\\/]|wrangler\.(?:jsonc|toml|config\.ts)|cloudflare\.config\.ts|app\.registry\.json|CLAUDE\.md|REVIEW\.md|POLICIES\.md|LEARNED\.md|docs[\\/]|\.yolo-sdlc\.json|content\.config\.ts|colada\.options\.ts)/

// `git push`, also with options before it: git -C . push, git -c k=v push, git --no-pager push.
const PUSH = String.raw`\bgit(?:\s+-[Cc]\s+\S+|\s+-\S+)*\s+push\b`
const isPush = (command) => new RegExp(PUSH).test(command)

const BASH_RULES = [
  {
    re: /\bwrangler\b[^\n]*\b(?:deploy|publish|rollback|delete|secret|versions\s+(?:upload|deploy))\b/,
    why: 'Going live, rolling back and managing secrets happen only through the reviewed pipeline, never from a session.',
  },
  {
    re: /\b(?:pnpm|npm|yarn)\s+(?:run\s+)?deploy/,
    why: 'Going live happens only through the reviewed pipeline, never from a session.',
  },
  {
    // Running the deploy scripts, by any runtime or runner (reading or searching them is fine),
    // and Workers Builds' own settings, which would make a session look like a build of main.
    re: /\b(?:node|bun|deno|tsx|npx|pnpm|yarn|npm)\b[^\n]*\bscripts[\\/](?:deploy-guard|cloudflare)\.mjs\b|\bWORKERS_CI\w*\s*=/,
    why: 'Going live happens only through the reviewed pipeline (Cloudflare Workers Builds), never from a session.',
  },
  {
    re: /\bwrangler\b[^\n]*\b(?:d1|kv|r2)\b[^\n]*--remote\b/,
    why: 'This command would read or change the live database or storage. Live data changes only through a reviewed migration. Engineers read it from their own terminal.',
  },
  {
    re: new RegExp(PUSH + String.raw`[^\n]*(?:\s--force(?:-with-lease)?\b|\s-f\b|\s\+\S)`),
    why: 'Force-pushing rewrites history that other people may depend on.',
  },
  {
    re: new RegExp(PUSH + String.raw`[^\n]*\s(?:\S+:)?(?:main|master)\b`),
    why: 'Changes reach main only through a pull request, where the checks run.',
  },
  { re: /--no-verify\b/, why: 'Skipping the checks is not allowed.' },
  { re: /\bgh\s+pr\s+merge\b[^\n]*--admin\b/, why: 'Merging past the required checks is not allowed.' },
  { re: /\bgh\s+(?:secret|variable)\s+(?:set|delete)\b/, why: 'Repository secrets and settings are managed by engineers.' },
  {
    // The plugin's evals point these at stand-ins for GitHub and the live database, from outside
    // the session. Set from inside one, they could stand in for the real review steps.
    re: /\bYOLO_SDLC_(?:GH|REPORTS)\b/,
    why: 'YOLO_SDLC_GH and YOLO_SDLC_REPORTS are test settings for the plugin\'s own evals, never for real work.',
  },
]

// Cloudflare's `cf` CLI reaches ~3,000 API operations (deploys, live databases, secrets,
// DNS, accounts), so it's allowed only for what stays on this computer. Everything else is
// blocked for everyone, like `wrangler deploy`: engineers run it from their own terminal.
// Every `cf` word counts, wherever it stands, so wrapped forms do too: `bash -c "cf deploy"`,
// `(cf deploy)`, `env cf …`, `"cf" deploy`, `./node_modules/.bin/cf …`, `npx cf@beta …`. A call
// is allowed only if it is exactly one of a few forms that stay on this computer; anything
// else, options first included (`cf --account-id X deploy`), is blocked. That fails safe:
// "cf deploy" inside a commit message is blocked as well.
const CF_WORD = /(?:^|[\s;&|(){}`'"=/\\])cf(?:@[\w.-]+)?(?:\.(?:cmd|exe|js))?['"]?(?=\s|$)/gi
function cfLocal(args) {
  if (!args.length) return true // bare `cf` prints its help
  if (args.length === 1 && ['--version', '-v'].includes(args[0])) return true
  // Help for a command: --help as the very last word, and no `--` that could hide it.
  if (['--help', '-h'].includes(args.at(-1)) && !args.includes('--')) return true
  if (args[0] === 'cli' && args[1] === 'search') return true // offline command search
  return args.length === 4 && args[0] === 'd1' && args[1] === 'migrations' && args[2] === 'create' // a local file
}
// Trailing output redirects that write nothing: `2>&1`, `>&2`, `>/dev/null`, `2>/dev/null`,
// `&>/dev/null`, each a whole word of its own. Redirects into a file aren't on the list, so
// `cf --help > notes.txt` is still blocked.
const HARMLESS_REDIRECT = /^(?:\d?>&\d|(?:\d|&)?>>?\/dev\/null)$/
// Shell words the way bash joins them: text touching a quote is the same word, so
// `"--help"2>&1` is one word (bash passes `--help2`), never `--help` plus a redirect.
const SHELL_WORD = /(?:"[^"]*"|'[^']*'|[^\s"'])+/g
const unquote = (w) => w.replace(/"([^"]*)"|'([^']*)'/g, '$1$2')
function cfCallsOnline(command) {
  for (const m of command.matchAll(CF_WORD)) {
    // The rest of that one command, as shell words (quotes removed after splitting).
    const tail = command.slice(m.index + m[0].length).split(/&&|\|\||[;|\n)`]/)[0]
    const words = tail.match(SHELL_WORD) ?? []
    while (words.length && HARMLESS_REDIRECT.test(words.at(-1))) words.pop()
    const args = words.map(unquote)
    if (!cfLocal(args)) return true
  }
  return false
}

function checkBash(command, cwd) {
  if (cfCallsOnline(command)) {
    deny(
      "Blocked by the risk check: the `cf` CLI can deploy, change live data and secrets, and manage the whole Cloudflare account. From a session only a few local forms are allowed: `cf cli search \"…\"`, `cf <command> --help`, `cf d1 migrations create <name>`. Run the app with `pnpm dev`. Going live happens through the reviewed pipeline; engineers run anything else from their own terminal." +
        TAIL,
    )
  }
  for (const rule of BASH_RULES) if (rule.re.test(command)) deny(`Blocked by the risk check: ${rule.why} ${TAIL}`)
  if (isPush(command) && ['main', 'master'].includes(currentBranch(cwd))) {
    deny(`Blocked by the risk check: you're on main. Work happens on a branch and reaches main through a pull request. ${TAIL}`)
  }
  if (!isEngineer && PROTECTED_IN_SHELL.test(command)) {
    deny(`Blocked by the risk check: this command would change an engineer-owned file (safety checks, infrastructure or ownership). ${TAIL}`)
  }
  if (isPush(command)) requireReviewBeforePush(cwd)
}

// Review before push: a yellow or red branch leaves this computer only after the engineer
// review of its exact commit (/yolo-sdlc:ship step 3 saves it to .git/yolo-sdlc-review/<sha>.json).
// Engineers, and apps where people review instead ("claudeReview": false), push freely.
function requireReviewBeforePush(cwd) {
  if (isEngineer || registryField(cwd, 'claudeReview') === false || !isGitRepo(cwd)) return
  const base = resolveBase(cwd, 'origin/main')
  const { tier } = classify(collectChanges({ cwd, base }), config, { data: registryField(cwd, 'data') })
  if (tier === 'green') return
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
  if (reviewSaved(cwd, head)) return
  deny(
    `Blocked by the risk check: this is a ${tier} change, and commit ${head.slice(0, 7)} hasn't had its engineer review yet. ` +
      `Run the review first (/yolo-sdlc:ship step 3): it saves to .git/yolo-sdlc-review/${head}.json, and then the push goes through. ${TAIL}`,
  )
}

// A saved review counts only if it's a complete review of exactly this commit, the same check
// `pnpm review:post` makes. The file is local and could be forged: the merge gate is the lock.
function reviewSaved(cwd, head) {
  try {
    const review = JSON.parse(readFileSync(join(gitDir(cwd), 'yolo-sdlc-review', `${head}.json`), 'utf8'))
    return validateReview(review).length === 0 && review.sha === head
  } catch {
    return false
  }
}

function registryField(cwd, field) {
  try {
    return JSON.parse(readFileSync(join(cwd, 'app.registry.json'), 'utf8'))[field]
  } catch {
    return undefined
  }
}

// ---------- File edits ----------

function lines(s) {
  return s ? s.split(/\r?\n/) : []
}

// Lines in `after` that weren't in `before` — enough to judge what an edit introduces.
function newLines(before, after) {
  const had = new Set(lines(before))
  return lines(after).filter((l) => !had.has(l))
}

function applyEdit(content, { old_string, new_string, replace_all }) {
  if (old_string === undefined) return content
  return replace_all ? content.split(old_string).join(new_string) : content.replace(old_string, () => new_string)
}

function changeFor(tool, input, projectDir) {
  const abs = input.file_path ?? input.notebook_path
  if (!abs) return null
  const rel = normalizePath(relative(projectDir, isAbsolute(abs) ? abs : join(projectDir, abs)))
  if (rel.startsWith('../') || isAbsolute(rel)) return null // outside the project
  const exists = existsSync(abs)
  const before = exists ? readFileSync(abs, 'utf8') : ''
  let after = before
  let added = []
  if (tool === 'Write') {
    after = input.content ?? ''
    added = newLines(before, after)
  } else if (tool === 'Edit') {
    after = applyEdit(before, input)
    added = newLines(input.old_string, input.new_string)
  } else if (tool === 'MultiEdit') {
    for (const e of input.edits ?? []) {
      after = applyEdit(after, e)
      added.push(...newLines(e.old_string, e.new_string))
    }
  } else if (tool === 'NotebookEdit') {
    added = lines(input.new_source)
    after = null
  }
  return { path: rel, status: exists ? 'modified' : 'added', added, content: after }
}

function checkEdit(tool, input, projectDir) {
  const change = changeFor(tool, input, projectDir)
  if (!change) return
  const gating = { ...config, rules: config.rules.filter((r) => r.block || (r.protected && !isEngineer)) }
  const { findings } = classify([change], gating)
  const hit = findings[0]
  if (!hit) return
  const next = hit.next ? ` ${hit.next}` : ''
  deny(`Blocked by the risk check (${hit.rule}): ${hit.why}${next} ${TAIL}`)
}

// ---------- Post: tier notice ----------

function readRegistry(projectDir) {
  try {
    return JSON.parse(readFileSync(join(projectDir, 'app.registry.json'), 'utf8'))
  } catch {
    return undefined
  }
}

function notifyTier(projectDir) {
  if (!isGitRepo(projectDir)) return
  const base = resolveBase(projectDir)
  const registry = readRegistry(projectDir)
  const result = classify(collectChanges({ cwd: projectDir, base }), config, { data: registry?.data })
  const stateFile = join(gitDir(projectDir), 'risk-tier-last')
  const previous = existsSync(stateFile) ? readFileSync(stateFile, 'utf8').trim() : 'green'
  if (previous === result.tier) return
  writeFileSync(stateFile, result.tier)
  // Rising to yellow or red is also shown to the person directly, so they know right away.
  const notice = rose(previous, result.tier) ? { systemMessage: formatNotice(result, registry) } : {}
  emit({ ...notice, hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: formatForSession(result, previous) } })
}

// ---------- Main ----------

const mode = process.argv[2]
let payload = {}
try {
  payload = JSON.parse(readFileSync(0, 'utf8') || '{}')
} catch {}
const projectDir = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd()
const tool = payload.tool_name
const input = payload.tool_input ?? {}

try {
  if (mode === 'pre') {
    if (tool === 'Bash') checkBash(input.command ?? '', projectDir)
    else checkEdit(tool, input, projectDir)
  } else if (mode === 'post') {
    notifyTier(projectDir)
  }
} catch (err) {
  if (mode === 'pre') deny(`The risk check itself failed (${err.message}), so this change was stopped to be safe. Ask an engineer to look at scripts/risk-tier.`)
  // post is advisory — never break the session over a notice
}
process.exit(0)
