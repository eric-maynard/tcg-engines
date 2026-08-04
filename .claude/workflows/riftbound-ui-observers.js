export const meta = {
  name: 'riftbound-ui-observers',
  description: 'Visual/UX audit: agents look at Playwright screenshots and report usability findings.',
  phases: [
    { title: 'Review', detail: 'one agent per screenshot × lens (layout / usability / info-leak / correctness)' },
    { title: 'Dedupe', detail: 'group by finding key' },
  ],
}

const SHOTS_DIR = args?.shotsDir ?? '/tmp/ui-shots'
const shots = args?.shots ?? [
  '02-lobby.png', '03-goldfish-lobby.png', '04-deck-selected.png',
  '05a-turn-order.png', '06b-mulligan-hover.png', '07-board.png', '08-hand-hover.png', '09-decks.png',
]

const LENSES = [
  { key: 'usability', prompt: 'Does the UI hide, cover, or make hard-to-reach anything the user needs to click or read? Are tooltips/popovers positioned sensibly? Is text readable?' },
  { key: 'correctness', prompt: 'Is anything visually wrong: impossible values (e.g. d20 showing 21), duplicate elements that shouldn\'t be, missing icons/fonts (tofu boxes), broken images?' },
  { key: 'info-leak', prompt: 'Can the player see anything they shouldn\'t (opponent hand faces, hidden cards, etc.)? Is anything the player NEEDS to see missing?' },
  { key: 'layout', prompt: 'Is space used well? Are zones labeled? Is anything cramped, overlapping, or floating in dead space?' },
]

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['high','medium','low'] },
          area: { type: 'string' },
          issue: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['severity','area','issue'],
      },
    },
  },
  required: ['findings'],
}

phase('Review')
const jobs = []
for (const shot of shots) {
  for (const lens of LENSES) {
    jobs.push({ shot, lens })
  }
}
log(`${jobs.length} reviews (${shots.length} screenshots × ${LENSES.length} lenses)`)

const results = await parallel(jobs.map(j => () =>
  agent(
`You are reviewing a screenshot of the Riftbound TCG web app for UX/visual issues.

Screenshot: Read the image at ${SHOTS_DIR}/${j.shot}

Review lens: **${j.lens.key}** — ${j.lens.prompt}

This is the "${j.shot.replace(/^\d+[a-z]?-|\.png$/g,'').replace(/-/g,' ')}" screen. The app is a card game like Magic Arena / Hearthstone. **This is goldfish/sandbox mode — the opponent hand is intentionally face-up** (you play both sides). Do NOT report opponent-hand-face-up as a finding. Hover shows a large preview; mulligan lets you swap cards.

Return up to 4 concrete findings for THIS lens only. Skip if nothing to report. Be specific: "hover preview covers Keep button" not "layout could be better".`,
    { label: `${j.shot} × ${j.lens.key}`, phase: 'Review', schema: FINDINGS_SCHEMA }
  ).then(r => ({ shot: j.shot, lens: j.lens.key, findings: r?.findings ?? [] }))
))

phase('Dedupe')
const flat = results.filter(Boolean).flatMap(r => r.findings.map(f => ({ ...f, shot: r.shot, lens: r.lens })))
const byKey = new Map()
for (const f of flat) {
  const k = `${f.area}::${f.issue.slice(0,60).toLowerCase()}`
  if (!byKey.has(k)) byKey.set(k, { ...f, count: 0, shots: [] })
  const e = byKey.get(k); e.count++; if (!e.shots.includes(f.shot)) e.shots.push(f.shot)
}
const deduped = [...byKey.values()].sort((a,b) =>
  ({high:0,medium:1,low:2}[a.severity] - {high:0,medium:1,low:2}[b.severity]) || b.count - a.count
)

return { total: flat.length, unique: deduped.length, findings: deduped }
