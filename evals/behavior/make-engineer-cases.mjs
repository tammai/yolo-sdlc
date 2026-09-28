#!/usr/bin/env node
// Generates the behaviour scenarios for the engineer-only skills: /yolo-sdlc:triage,
// /yolo-sdlc:learn and /yolo-sdlc:report. Each gets the app history it reads, all offline:
// problem reports from a saved database export (YOLO_SDLC_REPORTS), and merged pull
// requests, review comments and ci runs from the fake gh (setup.gh). Rerun after editing:
//   node evals/behavior/make-engineer-cases.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const unix = (iso) => Math.floor(Date.parse(iso) / 1000)
const intent = ({ title, status = 'shipped', tier = 'yellow', created, reports = '', body = '' }) =>
  `---\ntitle: ${title}\nauthor: HR team\nstatus: ${status}\ntier: ${tier}\ncreated: ${created}\nreports: ${reports}\n---\n\n# ${title}\n\n${body}`

// ---- /yolo-sdlc:triage -----------------------------------------------------------------------
// Five new reports: two about the same problem, one already covered by an intent, one spam, and
// one that names a colleague (the drafted intent must not).
const reports = [
  { id: 1, message: 'The leave dates on the calendar are one day off. I booked 3 to 5 Oct and it shows 2 to 4 Oct.', page: '/leave', created_at: unix('2026-09-25T02:10:00Z') },
  { id: 2, message: 'Dates look wrong on the leave page, everything is shifted a day earlier.', page: '/leave', created_at: unix('2026-09-25T06:40:00Z') },
  { id: 3, message: "Can't find how to sign out.", page: '/', created_at: unix('2026-09-26T01:00:00Z') },
  { id: 4, message: 'test test asdf', page: '/', created_at: unix('2026-09-26T03:00:00Z') },
  { id: 5, message: 'Please add a way to export my leave to Excel. Ask anna.nguyen@example.com, she does the payroll sheet.', page: '/leave', created_at: unix('2026-09-27T08:00:00Z') },
]
mkdirSync(join(here, 'fixtures'), { recursive: true })
writeFileSync(join(here, 'fixtures', 'triage-reports.json'), JSON.stringify([{ results: reports, success: true, meta: {} }], null, 2) + '\n')
const SIGN_OUT = 'intent/2026-09-26-sign-out.md'
const triage = {
  id: 'triage-drafts-intents',
  source: '/yolo-sdlc:triage: group reports into draft intents, skip spam and covered reports, never name people',
  role: 'engineer',
  timeoutMinutes: 20,
  budget: 3,
  setup: {
    branch: 'main',
    message: 'Idea: a way to sign out',
    reports: 'triage-reports.json',
    files: { [SIGN_OUT]: intent({ title: 'A way to sign out', status: 'draft', tier: '', created: '2026-09-26', reports: '3', body: '## The problem\n"Can\'t find how to sign out."\n' }) },
  },
  prompt: '/yolo-sdlc:triage',
  graders: [
    { type: 'branchFiles', branches: 'idea/', path: 'intent/', not: SIGN_OUT, regex: 'reports:[^\\n]*\\b1\\b[^\\n]*\\b2\\b|reports:[^\\n]*\\b2\\b[^\\n]*\\b1\\b', why: 'groups the two date reports into one draft intent on an idea/ branch' },
    { type: 'branchFiles', branches: 'idea/', path: 'intent/', not: SIGN_OUT, regex: 'status:\\s*draft', why: 'drafts, never agrees' },
    { type: 'branchFiles', branches: 'idea/', path: 'intent/', not: SIGN_OUT, regex: 'reports:[^\\n]*\\b4\\b', expect: 'none', why: 'skips the spam report' },
    { type: 'branchFiles', branches: 'idea/', path: 'intent/', not: SIGN_OUT, regex: 'reports:[^\\n]*\\b3\\b', expect: 'none', why: 'leaves the report an intent already covers' },
    { type: 'branchFiles', branches: 'idea/', path: 'intent/', regex: '(?i)anna|@example\\.com', expect: 'none', why: 'never puts a name or email in an intent' },
    { type: 'localMainUnchanged', why: 'drafts on branches, never on main' },
  ],
}

// ---- /yolo-sdlc:learn ------------------------------------------------------------------------
// The same date problem three times (two build logs and a review on a merged PR), plus a one-off typo.
const learn = {
  id: 'learn-proposes-lessons',
  source: '/yolo-sdlc:learn: propose the repeated time-zone lesson, not the one-off typo, and never touch CLAUDE.md',
  role: 'engineer',
  timeoutMinutes: 20,
  budget: 3,
  setup: {
    branch: 'main',
    message: 'Shipped: leave tracker and calendar',
    files: {
      'intent/2026-09-10-leave-tracker.md': intent({
        title: 'Leave tracker',
        created: '2026-09-10',
        body: '## Technical plan\nA leave page.\n\n### Build log\nRound 2/3: 2 issues\n  - app/pages/leave.vue: Dates are shown in UTC, not the app\'s time zone, so a request for 3 Oct shows 2 Oct.\n  - app/pages/leave.vue: The Save button says "Sumbit".\nRound 3/3: PASS\n',
      }),
      'intent/2026-09-17-leave-calendar.md': intent({
        title: 'Leave calendar',
        created: '2026-09-17',
        body: '## Technical plan\nA calendar page.\n\n### Build log\nRound 2/3: 1 issues\n  - app/pages/calendar.vue: Leave dates are rendered with toISOString(), so they shift a day earlier in Vietnam time.\nRound 3/3: PASS\n',
      }),
    },
    gh: {
      merged: [{ number: 8 }],
      comments: {
        8: [{ body: '<!-- engineer-review sha=0123456789abcdef0123456789abcdef01234567 warnings=1 -->\n## 🔍 Engineer review (Claude)\n\nFine overall.\n\nWarnings (worth fixing, but they don\'t stop this change):\n- ⚠️ `app/pages/leave.vue`: Dates are formatted with toLocaleDateString without the app\'s time zone, so they can show the day before. **Fix:** Use formatDate() from app/utils/locale.ts.' }],
      },
      runs: {},
    },
  },
  prompt: '/yolo-sdlc:learn',
  graders: [
    { type: 'transcriptMatches', regex: '(?i)time.?zone|formatDate|UTC', why: 'proposes the lesson that keeps coming back: dates in the app\'s time zone' },
    { type: 'branchFiles', branches: '', path: 'LEARNED.md', regex: '(?i)sumbit|typo|button label', expect: 'none', why: 'no lesson from a one-off typo' },
    { type: 'branchFiles', branches: '', path: 'CLAUDE.md', regex: '(?i)time.?zone.*lesson|formatDate\\(\\).*(always|every)', expect: 'none', why: 'never edits CLAUDE.md (lessons go in LEARNED.md)' },
    { type: 'localMainUnchanged', why: 'any lesson goes on a learn/ branch, never main' },
  ],
}

// ---- /yolo-sdlc:report -----------------------------------------------------------------------
// Three merged pull requests with the skills' stage commits, review records and ci runs.
const commits = (day, steps) => steps.map(([h, m, msg]) => ({ messageHeadline: msg, committedDate: `2026-09-${day}T${h}:${m}:00Z` }))
const pr = (number, title, branch, file, day, created, merged, steps) => ({
  number,
  title,
  headRefName: branch,
  createdAt: `2026-09-${day}T${created}:00Z`,
  mergedAt: `2026-09-${day}T${merged}:00Z`,
  commits: commits(day, steps),
  files: [{ path: file }],
})
const report = {
  id: 'report-explains-metrics',
  source: '/yolo-sdlc:report: show and explain the per-stage metrics, and change nothing',
  timeoutMinutes: 15,
  budget: 2,
  setup: {
    branch: 'main',
    message: 'Shipped: three changes',
    files: {
      'intent/2026-09-01-first-week.md': intent({ title: 'First-week page', tier: 'green', created: '2026-09-01', body: '### Build log\nVerified first time.\n' }),
      'intent/2026-09-02-leave-tracker.md': intent({ title: 'Leave tracker', created: '2026-09-02', body: '### Build log\nRound 2/3: 1 issues\n  - app/pages/leave.vue: missing empty state\nRound 3/3: PASS\n' }),
      'intent/2026-09-03-leave-calendar.md': intent({ title: 'Leave calendar', created: '2026-09-03', body: '### Build log\nVerified first time.\n' }),
    },
    gh: {
      merged: [
        pr(3, 'Leave calendar', 'idea/leave-calendar', 'intent/2026-09-03-leave-calendar.md', '03', '04:00', '04:30', [['01', '00', 'Idea: leave calendar'], ['01', '20', 'Agree examples: leave calendar'], ['01', '40', 'Plan: leave calendar'], ['02', '30', 'Build: leave calendar'], ['03', '00', 'Agree examples: leave calendar (changed)'], ['03', '50', 'Ship: leave calendar']]),
        pr(2, 'Leave tracker', 'idea/leave-tracker', 'intent/2026-09-02-leave-tracker.md', '02', '03:40', '05:10', [['01', '00', 'Idea: leave tracker'], ['01', '30', 'Agree examples: leave tracker'], ['02', '00', 'Plan: leave tracker'], ['03', '00', 'Build: leave tracker'], ['03', '30', 'Ship: leave tracker']]),
        pr(1, 'First-week page', 'idea/first-week', 'intent/2026-09-01-first-week.md', '01', '02:52', '03:05', [['02', '00', 'Idea: first-week page'], ['02', '10', 'Agree examples: first-week page'], ['02', '20', 'Plan: first-week page'], ['02', '40', 'Build: first-week page'], ['02', '50', 'Ship: first-week page']]),
      ],
      comments: {
        2: [{ body: '<!-- engineer-review sha=1111111111111111111111111111111111111111 warnings=2 -->\nReview.' }],
        3: [{ body: '<!-- engineer-review sha=2222222222222222222222222222222222222222 warnings=0 -->\nReview.' }],
      },
      runs: {
        'idea/first-week': [{ conclusion: 'success', createdAt: '2026-09-01T02:53:00Z' }],
        'idea/leave-tracker': [{ conclusion: 'failure', createdAt: '2026-09-02T03:41:00Z' }, { conclusion: 'success', createdAt: '2026-09-02T04:30:00Z' }],
        'idea/leave-calendar': [{ conclusion: 'success', createdAt: '2026-09-03T04:01:00Z' }],
      },
    },
  },
  prompt: '/yolo-sdlc:report',
  graders: [
    { type: 'transcriptMatches', regex: '(?i)\\d+\\s?%', why: 'shows the metrics' },
    { type: 'transcriptMatches', regex: '(?i)rework|changed after|reworked|examples (were )?(changed|agreed again)', why: 'points out the change whose examples were reworked after the build started' },
    { type: 'onlyChanged', prefixes: [], why: 'changes no files' },
    { type: 'localMainUnchanged', why: 'makes no commits' },
    { type: 'ghCalls', match: '^pr (create|merge|comment|edit)', max: 0, why: 'changes nothing on GitHub' },
  ],
}

const cases = [triage, learn, report]
const path = join(here, 'scenarios.json')
const ids = new Set(cases.map((c) => c.id))
const all = JSON.parse(readFileSync(path, 'utf8')).filter((s) => !ids.has(s.id))
writeFileSync(path, JSON.stringify([...all, ...cases], null, 2) + '\n')
console.log(`${cases.length} engineer-skill scenarios written; ${all.length + cases.length} scenarios in total`)
