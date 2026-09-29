import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatNotice, rose, whoReviews } from '../report.mjs'

const red = { tier: 'red', findings: [{ tier: 'red', why: 'This stores information about real people.', path: 'server/db/schema.ts' }] }

test('rose: only a rise in tier counts', () => {
  assert.equal(rose('green', 'yellow'), true)
  assert.equal(rose('yellow', 'red'), true)
  assert.equal(rose('red', 'yellow'), false)
  assert.equal(rose('yellow', 'green'), false)
})

test('whoReviews: no reviewers says plainly that only Claude checks it', () => {
  assert.match(whoReviews('red', { reviewers: { yellow: [], red: [] } }), /Only the Claude engineer review.*No person is listed/)
  assert.match(whoReviews('yellow', {}), /No person is listed/)
  assert.match(whoReviews('red', { reviewers: { red: ['TODO-second-engineer-handle'] } }), /No person is listed/, 'placeholders are not people')
})

test('whoReviews: names the people who can approve, by tier', () => {
  const reg = { reviewers: { yellow: ['owner'], red: ['eng1'] } }
  assert.match(whoReviews('red', reg), /Claude engineer review.*or @eng1 can approve/)
  assert.doesNotMatch(whoReviews('red', reg), /@owner/)
  assert.match(whoReviews('yellow', reg), /@owner or @eng1/)
})

test('whoReviews: claudeReview false', () => {
  assert.match(whoReviews('red', { claudeReview: false, reviewers: { red: ['eng1'] } }), /^@eng1 must approve/)
  assert.match(whoReviews('red', { claudeReview: false }), /can’t go live until an engineer adds a reviewer/)
})

test('formatNotice: tier, reason and who reviews, in one message', () => {
  const n = formatNotice(red, { reviewers: { yellow: [], red: [] } })
  assert.match(n, /^🔴 Heads up: this change is now RED \(needs an engineer review\)\./)
  assert.match(n, /real people/)
  assert.match(n, /No person is listed/)
})
