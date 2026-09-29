// Regenerate with: node artifacts/gen-loop-simple.mjs artifacts/loop-simple.svg   (then check it: napkin's check_diagram.mjs)
// The plain-words version of loop.svg, for people who aren't engineers: six steps in a loop,
// shaded where the person decides. Every position is computed from the grid, so edges stay
// on their boxes if a size changes.
import { writeFileSync } from 'node:fs'

const W = 880
const H = 580
const CW = 240, CH = 150, GAP = 60, X0 = 20
const col = (i) => X0 + i * (CW + GAP)
const ROW1 = 84, ROW2 = 344
const card = (i, y) => ({ x: col(i), y, w: CW, h: CH, cx: col(i) + CW / 2, cy: y + CH / 2 })

// Top row left to right, bottom row right to left: a loop.
const steps = [
  { n: 1, at: card(0, ROW1), you: true, who: 'you decide', title: 'Tell Claude the problem', lines: ['In your own words.', 'It asks a few quick questions.'] },
  { n: 2, at: card(1, ROW1), you: true, who: 'you decide', title: 'Agree what “done” means', lines: ['Pick 2 to 5 examples, like', '“When I add a room, I see it.”'] },
  { n: 3, at: card(2, ROW1), you: false, who: 'Claude', title: 'Claude builds it', lines: ['It plans and builds, then a', 'second Claude checks the work.'] },
  { n: 4, at: card(2, ROW2), you: true, who: 'you decide', title: 'See it working', lines: ['A picture of each example.', 'Is this what you wanted?'] },
  { n: 5, at: card(1, ROW2), you: false, who: 'safety checks', title: 'It goes live, safely', lines: ['Riskier changes get a review', 'first. Only checked work', 'reaches the live app.'] },
  { n: 6, at: card(0, ROW2), you: true, who: 'you', title: 'Something wrong?', lines: ['Press “Report a problem”', 'on any page.'] },
]
const [s1, s2, s3, s4, s5, s6] = steps.map((s) => s.at)

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const pillW = (t) => Math.round(t.length * 6.6 + 20)
// A pill as a path: it sits inside its card, so it's drawn like a label, not a separate box.
const pill = (x, y, w, h) => `M${x + h / 2},${y} H${x + w - h / 2} A${h / 2},${h / 2} 0 0 1 ${x + w - h / 2},${y + h} H${x + h / 2} A${h / 2},${h / 2} 0 0 1 ${x + h / 2},${y} Z`
const cardSvg = (s) => {
  const { x, y, w, h } = s.at
  const pw = pillW(s.who)
  return `  <g>
    <rect class="${s.you ? 'lp-you' : 'lp-card'}" x="${x}" y="${y}" width="${w}" height="${h}" rx="14" />
    <circle class="${s.you ? 'lp-num-you' : 'lp-num'}" cx="${x + 30}" cy="${y + 32}" r="16" />
    <text class="lp-numtext" x="${x + 30}" y="${y + 37}" text-anchor="middle">${s.n}</text>
    <path class="${s.you ? 'lp-pill-you' : 'lp-pill'}" d="${pill(x + w - 14 - pw, y + 21, pw, 22)}" />
    <text class="lp-pilltext" x="${x + w - 14 - pw / 2}" y="${y + 36}" text-anchor="middle">${esc(s.who)}</text>
    <text class="lp-title" x="${x + 16}" y="${y + 76}">${esc(s.title)}</text>
${s.lines.map((l, i) => `    <text class="lp-line" x="${x + 16}" y="${y + 102 + i * 19}">${esc(l)}</text>`).join('\n')}
  </g>`
}
const edge = (d, cls = 'lp-edge') => `  <path class="${cls}" d="${d}" marker-end="url(#lp-arrow)" />`

const aria =
  'How a change goes from a problem to the live app, in six steps that loop. 1, you tell Claude the problem in your own words. 2, you agree what done means by picking 2 to 5 examples. 3, Claude builds it and a second Claude checks the work. 4, you see a picture of each example working and say whether it is what you wanted; if not quite, you change the examples. 5, it goes live safely: riskier changes get a review first, and only checked work reaches the live app. 6, if something is wrong, anyone presses Report a problem, and it becomes the next idea, back at step 1.'

const midGap = (ROW1 + CH + ROW2) / 2 // the band between the rows
const svg = `<svg class="lp" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${aria}">
  <style>
    .lp { --lp-bg: #f6f8fb; --lp-card: #ffffff; --lp-line: #d3dae3; --lp-ink: #17202c; --lp-muted: #586273; --lp-you: #dcf0f2; --lp-you-line: #0b7a83; --lp-edge: #7a8494; }
    @media (prefers-color-scheme: dark) {
      .lp { --lp-bg: #111821; --lp-card: #18212c; --lp-line: #2d3a48; --lp-ink: #e8eef5; --lp-muted: #a3afbd; --lp-you: #0f3036; --lp-you-line: #4fc3cc; --lp-edge: #8d99a8; }
    }
    .lp-bg { fill: var(--lp-bg); }
    .lp-card { fill: var(--lp-card); stroke: var(--lp-line); stroke-width: 1.5; }
    .lp-you { fill: var(--lp-you); stroke: var(--lp-you-line); stroke-width: 2; }
    .lp-num { fill: var(--lp-ink); }
    .lp-num-you { fill: var(--lp-you-line); }
    .lp-numtext { fill: var(--lp-bg); font: 700 16px 'Bricolage Grotesque', system-ui, sans-serif; }
    .lp-pill { fill: none; stroke: var(--lp-line); stroke-width: 1.25; }
    .lp-pill-you { fill: none; stroke: var(--lp-you-line); stroke-width: 1.25; }
    .lp-pilltext { fill: var(--lp-muted); font: 600 11.5px 'Atkinson Hyperlegible', system-ui, sans-serif; letter-spacing: 0.02em; }
    .lp-title { fill: var(--lp-ink); font: 700 16px 'Bricolage Grotesque', system-ui, sans-serif; }
    .lp-line { fill: var(--lp-muted); font: 13.5px 'Atkinson Hyperlegible', system-ui, sans-serif; }
    .lp-heading { fill: var(--lp-ink); font: 700 20px 'Bricolage Grotesque', system-ui, sans-serif; }
    .lp-label { fill: var(--lp-muted); font: 600 12.5px 'Atkinson Hyperlegible', system-ui, sans-serif; }
    .lp-edge { fill: none; stroke: var(--lp-edge); stroke-width: 2; }
    .lp-back { fill: none; stroke: var(--lp-edge); stroke-width: 2; stroke-dasharray: 6 5; }
    .lp-arrowhead { fill: var(--lp-edge); }
  </style>
  <defs>
    <marker id="lp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path class="lp-arrowhead" d="M0,0 L10,5 L0,10 z" />
    </marker>
  </defs>
  <path class="lp-bg" d="M0,0 H${W} V${H} H0 Z" />
  <text class="lp-heading" x="${X0}" y="44">From a problem to the live app, in six steps</text>

  <!-- The loop -->
${edge(`M${s1.x + CW} ${s1.cy} H${s2.x}`)}
${edge(`M${s2.x + CW} ${s2.cy} H${s3.x}`)}
${edge(`M${s3.cx} ${s3.y + CH} V${s4.y}`)}
${edge(`M${s4.x} ${s4.cy} H${s5.x + CW}`)}
${edge(`M${s5.x} ${s5.cy} H${s6.x + CW}`)}
${edge(`M${s6.cx} ${s6.y} V${s1.y + CH}`, 'lp-back')}
  <text class="lp-label" x="${s6.cx + 12}" y="${midGap + 5}">it becomes the next idea</text>

  <!-- Not quite: back to the examples -->
// Box 4's top face also takes the arrow from box 3 (at its centre), so this one leaves off-centre.
${edge(`M${s4.x + 40} ${s4.y} V${midGap + 12} H${s2.cx} V${s2.y + CH}`, 'lp-back')}
  <text class="lp-label" x="${(s2.cx + s4.x + 40) / 2}" y="${midGap + 3}" text-anchor="middle">not quite? change the examples</text>

${steps.map(cardSvg).join('\n')}

  <text class="lp-label" x="${X0}" y="${H - 22}">Shaded steps are where you decide. Claude and the safety checks do the rest.</text>
</svg>
`
writeFileSync(process.argv[2], svg)
console.log(`wrote ${process.argv[2]} (${W}×${H})`)
