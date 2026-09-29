import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { createApp, parseReviewers, pluginVersion } from '../new-app.mjs'
import { updateApp } from '../update-app.mjs'

// Short temp paths: Windows' 260-character limit bites deep scaffold paths otherwise.
const root = mkdtempSync(join(tmpdir(), 'yolosdlc-'))
after(() => rmSync(root, { recursive: true, force: true }))
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

test('new-app: an internal app gets the dashboard shell, its name, type and a first commit', () => {
  const dir = join(root, 'staff')
  const r = createApp(dir, { name: 'leave-tracker', type: 'internal', data: 'personal', owner: 'hr-lead', description: 'Staff leave requests and approvals' })
  assert.equal(r.template, 'dashboard')
  const reg = readJson(join(dir, 'app.registry.json'))
  assert.deepEqual([reg.name, reg.type, reg.data], ['leave-tracker', 'internal', 'personal'])
  // The registry comes filled in: owner, reviewers, description and a review date 6 months out.
  assert.equal(reg.owner, 'hr-lead')
  assert.deepEqual(reg.reviewers, { yellow: ['hr-lead'], red: ['hr-lead'] }, 'reviewers left out: the owner alone')
  assert.equal(reg.description, 'Staff leave requests and approvals')
  const months = (Date.parse(reg.reviewBy) - Date.now()) / (30.4 * 864e5)
  assert.ok(months > 5.5 && months < 6.5, `reviewBy ${reg.reviewBy} is about 6 months out`)
  assert.throws(() => createApp(join(root, 'bad-owner'), { name: 'x-app', type: 'internal', data: 'internal', owner: 'not a handle' }), /GitHub handle/)
  const wr = readFileSync(join(dir, 'wrangler.jsonc'), 'utf8')
  assert.match(wr, /"name": "leave-tracker"/)
  assert.doesNotMatch(wr, /todo-app-name/)
  assert.match(readFileSync(join(dir, 'app/app.config.ts'), 'utf8'), /name: 'Leave Tracker'/)
  assert.equal(readJson(join(dir, '.yolo-sdlc.json')).version, pluginVersion())
  assert.ok(!existsSync(join(dir, 'node_modules')), 'no build output copied')
  assert.ok(!existsSync(join(dir, '.claude/skills')), 'skills come from the plugin, not the app')
  assert.equal(readJson(join(dir, '.claude/settings.json')).enabledPlugins['yolo-sdlc@yolo-sdlc'], true)
  assert.match(git(dir, 'log', '--oneline'), /Start leave-tracker from yolo-sdlc/)
})

test('new-app: reviewers are optional — none, or the handles given', () => {
  const none = join(root, 'solo')
  createApp(none, { name: 'solo-app', type: 'prototype', data: 'public', owner: 'hr-lead', reviewers: parseReviewers('none'), git: false })
  assert.deepEqual(readJson(join(none, 'app.registry.json')).reviewers, { yellow: [], red: [] })
  const some = join(root, 'team')
  createApp(some, { name: 'team-app', type: 'prototype', data: 'public', owner: 'hr-lead', reviewers: parseReviewers('@hr-lead, eng1,eng1'), git: false })
  assert.deepEqual(readJson(join(some, 'app.registry.json')).reviewers, { yellow: ['hr-lead', 'eng1'], red: ['hr-lead', 'eng1'] })
  assert.equal(parseReviewers(undefined), undefined)
  assert.throws(() => parseReviewers('ok,not a handle'), /GitHub handle/)
})

test('new-app: a public app gets the landing shell, its content, and APP_TYPE public', () => {
  const dir = join(root, 'site')
  assert.equal(createApp(dir, { name: 'careers', type: 'public', data: 'internal', git: false }).template, 'landing')
  assert.ok(existsSync(join(dir, 'content/landing.yml')))
  assert.ok(readJson(join(dir, 'package.json')).dependencies['@nuxt/content'])
  assert.match(readFileSync(join(dir, 'wrangler.jsonc'), 'utf8'), /"APP_TYPE": "public"/)
})

test('new-app: refuses bad input and non-empty folders', () => {
  assert.throws(() => createApp(join(root, 'x1'), { name: 'Bad Name', type: 'internal', data: 'internal' }), /lowercase/)
  assert.throws(() => createApp(join(root, 'x2'), { name: 'ok-name', type: 'saas', data: 'internal' }), /type/)
  const full = join(root, 'full')
  mkdirSync(full)
  writeFileSync(join(full, 'keep.txt'), 'mine')
  assert.throws(() => createApp(full, { name: 'ok-name', type: 'internal', data: 'internal' }), /isn't empty/)
})

test("update-app: restores plugin files and never touches the app's own work", () => {
  const dir = join(root, 'upd')
  createApp(dir, { name: 'upd-app', type: 'internal', data: 'internal' })
  const cfg = ['-c', 'user.email=t@t', '-c', 'user.name=t']
  // The app's own work, plus an out-of-date plugin file and an engineer's extra script.
  mkdirSync(join(dir, 'app/pages/leave'), { recursive: true })
  writeFileSync(join(dir, 'app/pages/leave/index.vue'), '<template>HR work</template>\n')
  writeFileSync(join(dir, 'server/db/schema.ts'), readFileSync(join(dir, 'server/db/schema.ts'), 'utf8') + '\n// leave table\n')
  writeFileSync(join(dir, 'tests/examples/leave.spec.ts'), '// HR examples\n')
  writeFileSync(join(dir, 'scripts/risk-tier/hook.mjs'), '// old hook\n')
  writeFileSync(join(dir, 'scripts/seed.mjs'), '// engineer extra\n')
  mkdirSync(join(dir, '.claude/skills/ship'), { recursive: true })
  writeFileSync(join(dir, '.claude/skills/ship/SKILL.md'), '# old in-repo copy\n')
  mkdirSync(join(dir, '.claude/skills/my-own'), { recursive: true })
  writeFileSync(join(dir, '.claude/skills/my-own/SKILL.md'), '# an engineer skill\n')
  // Seeds: an app's own policies stay; a missing lessons file is created.
  writeFileSync(join(dir, 'POLICIES.md'), '# Our policies\nChecked at `/ai-sdlc:shape`. Our ai-sdlc rollout is in Q3.\n')
  rmSync(join(dir, 'LEARNED.md'))
  // An app from before the rename: its version stamp is .ai-sdlc.json.
  rmSync(join(dir, '.yolo-sdlc.json'))
  writeFileSync(join(dir, '.ai-sdlc.json'), JSON.stringify({ plugin: 'ai-sdlc', version: '0.3.0' }) + '\n')
  const pkg = readJson(join(dir, 'package.json'))
  pkg.scripts.check = 'echo old'
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
  execFileSync('git', [...cfg, 'commit', '-qam', 'app work'], { cwd: dir })
  execFileSync('git', ['add', '-A'], { cwd: dir })
  execFileSync('git', [...cfg, 'commit', '-qm', 'app files'], { cwd: dir })
  const appFiles = ['app/pages/leave/index.vue', 'server/db/schema.ts', 'tests/examples/leave.spec.ts', 'app/app.config.ts', 'wrangler.jsonc', 'app.registry.json']
  const before = Object.fromEntries(appFiles.map((f) => [f, readFileSync(join(dir, f), 'utf8')]))

  process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = 't'
  process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = 't@t'
  const r = updateApp(dir)
  assert.equal(r.branch, `yolo-sdlc-update-${pluginVersion()}`)
  assert.ok(r.changed.includes('scripts/risk-tier/hook.mjs'))
  assert.ok(r.changed.includes('package.json (scripts)'))
  assert.deepEqual(r.extra, ['scripts/seed.mjs'])
  // The app's own policies stay, except the old command names, which are renamed.
  assert.equal(readFileSync(join(dir, 'POLICIES.md'), 'utf8'), '# Our policies\nChecked at `/yolo-sdlc:shape`. Our ai-sdlc rollout is in Q3.\n')
  assert.ok(r.changed.includes('LEARNED.md') && r.changed.includes('POLICIES.md (old command names)') && !r.changed.includes('POLICIES.md'))
  const intent = r.changed.find((c) => /^intent\/\d{4}-\d\d-\d\d-yolo-sdlc-update-/.test(c))
  assert.ok(intent, 'the update writes its own intent')
  const text = readFileSync(join(dir, intent), 'utf8')
  assert.match(text, new RegExp(`to ${pluginVersion().replace(/\./g, '\\.')}`))
  assert.match(text, /tier: red/)
  assert.match(text, /are from plugin version 0\.3\.0/)
  assert.ok(!existsSync(join(dir, '.ai-sdlc.json')), 'the pre-rename stamp is removed')
  assert.equal(readJson(join(dir, '.yolo-sdlc.json')).version, pluginVersion())
  assert.equal(readJson(join(dir, '.claude/settings.json')).enabledPlugins['yolo-sdlc@yolo-sdlc'], true)
  assert.match(text, /`scripts\/risk-tier\/hook\.mjs`/)
  assert.notEqual(readFileSync(join(dir, 'scripts/risk-tier/hook.mjs'), 'utf8'), '// old hook\n')
  assert.notEqual(readJson(join(dir, 'package.json')).scripts.check, 'echo old')
  for (const f of appFiles) assert.equal(readFileSync(join(dir, f), 'utf8'), before[f], `${f} must not change`)
  assert.ok(existsSync(join(dir, 'scripts/seed.mjs')), 'extra engineer files are kept')
  assert.ok(!existsSync(join(dir, '.claude/skills/ship')), 'old in-repo copies of plugin skills are removed')
  assert.ok(existsSync(join(dir, '.claude/skills/my-own/SKILL.md')), 'other skills are kept')
  assert.equal(git(dir, 'status', '--porcelain'), '', 'the update is committed on its branch')

  assert.deepEqual(updateApp(dir, { git: false }).changed, [], 'a second run finds nothing to update')
})

test('update-app: refuses a folder that is not a yolo-sdlc app, and uncommitted work', () => {
  const plain = join(root, 'plain')
  mkdirSync(plain)
  assert.throws(() => updateApp(plain), /doesn't look like a yolo-sdlc app/)
  const dirty = join(root, 'dirty')
  createApp(dirty, { name: 'dirty-app', type: 'prototype', data: 'public' })
  writeFileSync(join(dirty, 'app/app.config.ts'), '// unsaved\n')
  assert.throws(() => updateApp(dirty), /uncommitted/)
})
