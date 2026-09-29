// Plain-language wording for a classification. The reader is usually the person
// who asked for the change, not an engineer — say what it means, not how it works.

export const TIER_MEANING = {
  green: {
    icon: '🟢',
    title: 'Safe to ship',
    text: 'The automatic checks are enough for this change. It can go live once they pass.',
  },
  yellow: {
    icon: '🟡',
    title: 'Needs a review',
    text: 'This changes what the app stores or how its server handles data. A separate Claude reviewer checks it at /yolo-sdlc:ship and lists any warnings before it goes live.',
  },
  red: {
    icon: '🔴',
    title: 'Needs an engineer review',
    text: 'This touches something where a mistake is costly: personal data, sign-in, outside services, libraries or live infrastructure. A separate Claude reviewer checks it closely at /yolo-sdlc:ship and lists any warnings before it goes live.',
  },
}

// Group findings by rule so one reason shows once, with every file it applies to.
function grouped(findings) {
  const byRule = new Map()
  for (const f of findings) {
    const g = byRule.get(f.rule) ?? { ...f, places: [] }
    g.places.push(f.detail ? `\`${f.path}\` — ${f.detail}` : `\`${f.path}\``)
    byRule.set(f.rule, g)
  }
  return [...byRule.values()].sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'red' ? -1 : 1))
}

export function formatReport({ tier, findings, escalated }, decision, review) {
  const m = TIER_MEANING[tier]
  const lines = [`## ${m.icon} ${m.title}`, '', m.text]
  if (escalated) {
    lines.push(
      '',
      `This app is registered as holding **${escalated.data}** data, so a change that would normally be ${escalated.from} is treated as ${escalated.to}.`,
    )
  }
  const reasons = grouped(findings).filter((g) => g.tier !== 'green')
  if (reasons.length) {
    lines.push('', '### Why')
    for (const g of reasons) {
      lines.push('', `**${TIER_MEANING[g.tier].icon} ${g.why}**`)
      if (g.next) lines.push(`What happens next: ${g.next}`)
      const shown = g.places.slice(0, 5)
      for (const p of shown) lines.push(`- ${p}`)
      if (g.places.length > shown.length) lines.push(`- …and ${g.places.length - shown.length} more`)
    }
  }
  if (review) {
    const link = review.url ? ` ([the review](${review.url}))` : ''
    lines.push('', '### Engineer review', '', `Done by Claude on commit \`${review.sha.slice(0, 7)}\`${link}.`)
  }
  if (decision) {
    lines.push('', '### Status', '', decision.pass ? `✅ ${decision.reason}` : `⏳ ${decision.reason}`)
    if (!decision.pass && tier !== 'green') {
      lines.push(
        '',
        'To clear it, run **/yolo-sdlc:ship** in Claude on this branch: it runs the engineer review and posts it here. Or a reviewer approves the pull request, then adds the `recheck-risk` label.',
      )
    }
  }
  return lines.join('\n')
}

const RANK = { green: 0, yellow: 1, red: 2 }
export const rose = (previous, tier) => (RANK[tier] ?? 0) > (RANK[previous] ?? 0)

// Who can clear a yellow or red change, in words. Reviewers are optional: with none listed,
// the Claude engineer review alone clears it, and the person should know that.
export function whoReviews(tier, registry) {
  const list = (k) => registry?.reviewers?.[k] ?? []
  const people = [...new Set(tier === 'red' ? list('red') : [...list('yellow'), ...list('red')])]
    .filter((h) => h && !/^TODO-/.test(h))
    .map((h) => '@' + h)
  const claude = registry?.claudeReview !== false
  if (claude && !people.length) {
    return 'Only the Claude engineer review checks it before it goes live. No person is listed as a reviewer for this app, so make sure you are comfortable with that.'
  }
  // GitHub never lets anyone approve their own pull request, so a listed reviewer who made the
  // change can't clear it: say so, rather than suggest they can.
  const own = people.length === 1 && registry?.owner && people[0] === '@' + registry.owner
    ? ` If you are ${people[0]}, you can't approve your own change, so only the Claude review checks it.`
    : ' Nobody can approve their own change.'
  if (claude) return `The Claude engineer review checks it before it goes live, or ${people.join(' or ')} can approve it.${own}`
  if (people.length) return `${people.join(' or ')} must approve it before it goes live.${own.replace(', so only the Claude review checks it', '')}`
  return 'Nobody listed can approve it, so it can’t go live until an engineer adds a reviewer to app.registry.json.'
}

// Shown to the person directly (not only to Claude) when a change becomes yellow or red,
// so they know before they carry on.
export function formatNotice({ tier, findings }, registry) {
  const m = TIER_MEANING[tier]
  const why = [...new Set(findings.filter((f) => f.tier === tier).map((f) => f.why))].slice(0, 2)
  return [`${m.icon} Heads up: this change is now ${tier.toUpperCase()} (${m.title.toLowerCase()}).`, ...why, whoReviews(tier, registry)].join(' ')
}

// One line for the Claude session, which then explains it to the user in its own words.
export function formatForSession({ tier, findings }, previous) {
  const m = TIER_MEANING[tier]
  const reasons = [...new Set(findings.filter((f) => f.tier === tier).map((f) => `${f.why} (${f.path})`))].slice(0, 4)
  return [
    `Risk tier for this branch is now ${tier.toUpperCase()} (was ${previous}). ${m.title}: ${m.text}`,
    ...reasons.map((r) => `- ${r}`),
    'When you next reply, tell the user this in one or two plain sentences — no jargon, no file paths unless they ask. Do not try to lower the tier by working around a rule.',
  ].join('\n')
}
