export const meta = {
  name: 'riftbound-ui-loop',
  description: 'Autonomous UI improvement loop: drive → observe → fix → sync → bounce, repeated until HIGH findings converge.',
  phases: [
    { title: 'Drive', detail: 'Playwright driver → screenshots' },
    { title: 'Observe', detail: 'N shots × 4 lenses' },
    { title: 'Fix', detail: 'top-8 HIGH findings' },
    { title: 'Sync', detail: 'rsync + bounce app' },
  ],
}

const REPO = '/root/src/tcg/tcg-engines'
const SHOTS_DIR = '/tmp/ui-shots'
const MAX_ROUNDS = args?.rounds ?? 12
const FIXERS_PER_ROUND = args?.fixers ?? 6

const LENSES = [
  { key: 'usability', prompt: 'Does the UI hide, cover, or make hard-to-reach anything the user needs? Tooltips positioned sensibly? Text readable?' },
  { key: 'correctness', prompt: 'Visually wrong: impossible values, dupes, tofu boxes, broken images, out-of-sync panels?' },
  { key: 'layout', prompt: 'Space used well? Zones labeled? Cramped/overlapping/floating?' },
]

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: { findings: { type: 'array', items: { type: 'object', properties: {
    severity: {type:'string',enum:['high','medium','low']}, area:{type:'string'}, issue:{type:'string'}, suggestion:{type:'string'}
  }, required:['severity','area','issue']}}},
  required: ['findings'],
}

const FIX_SCHEMA = { type:'object', properties:{applied:{type:'boolean'},files:{type:'array',items:{type:'string'}},notes:{type:'string'}}, required:['applied','notes'] }
const DRIVE_SCHEMA = { type:'object', properties:{shots:{type:'array',items:{type:'string'}},ok:{type:'boolean'}}, required:['ok','shots'] }
const SYNC_SCHEMA = { type:'object', properties:{ok:{type:'boolean'},notes:{type:'string'}}, required:['ok'] }

const rounds = []
let lastHighCount = 999
let stable = 0

for (let round = 1; round <= MAX_ROUNDS; round++) {
  phase('Drive')
  log(`=== ROUND ${round} — driving ===`)
  const drive = await agent(
`Run the UI driver and report which screenshots were written.

1. \`rm -rf ${SHOTS_DIR}\`
2. \`cd /tmp/pwtest && bun drive.ts 2>&1 | tail -30\`
3. \`ls ${SHOTS_DIR}/\`

Return ok=true if ≥10 PNGs were written, and shots = the list of PNG filenames.`,
    { label: `R${round} drive`, phase: 'Drive', schema: DRIVE_SCHEMA }
  )
  if (!drive?.ok) { log(`R${round}: driver failed, stopping`); break }
  const shots = (drive.shots || []).filter(s => !/^0[01]-/.test(s)).slice(0, 14)

  phase('Observe')
  const obsJobs = []
  for (const shot of shots) for (const lens of LENSES) obsJobs.push({shot, lens})
  log(`R${round}: ${obsJobs.length} observers`)
  const obs = await parallel(obsJobs.map(j => () =>
    agent(
`Review screenshot ${SHOTS_DIR}/${j.shot} for UX issues. Lens: **${j.lens.key}** — ${j.lens.prompt}

Screen: "${j.shot.replace(/^\d+[a-z]?-|\.png$/g,'').replace(/-/g,' ')}". This is goldfish/sandbox mode — opponent hand is intentionally face-up. Do NOT report opponent-hand-face-up.

Return ≤3 concrete findings for THIS lens only. Be specific.`,
      { label: `R${round} ${j.shot}×${j.lens.key}`, phase: 'Observe', schema: FINDINGS_SCHEMA }
    ).then(r => (r?.findings||[]).map(f=>({...f,shot:j.shot,lens:j.lens.key})))
  ))
  const flat = obs.filter(Boolean).flat()
  const byKey = new Map()
  for (const f of flat) {
    const k = (f.area||'').slice(0,40).toLowerCase()
    if (!byKey.has(k)) byKey.set(k, {...f,count:0,shots:[]})
    const e = byKey.get(k); e.count++; if(!e.shots.includes(f.shot)) e.shots.push(f.shot)
  }
  const deduped = [...byKey.values()].sort((a,b) => ({high:0,medium:1,low:2}[a.severity]-{high:0,medium:1,low:2}[b.severity]) || b.count-a.count)
  const highs = deduped.filter(f=>f.severity==='high')
  log(`R${round}: ${flat.length} raw → ${deduped.length} unique → ${highs.length} HIGH`)

  phase('Fix')
  const toFix = highs.slice(0, FIXERS_PER_ROUND)
  if (toFix.length === 0) { log(`R${round}: 0 HIGH — converged`); rounds.push({round,total:flat.length,unique:deduped.length,high:0,fixed:0}); break }
  const fixed = await parallel(toFix.map((f,i) => () =>
    agent(
`Repo: ${REPO}. Apply a surgical UI fix for this finding.

Area: ${f.area}
Issue: ${f.issue}
Suggestion: ${f.suggestion || '(none)'}
Screenshots: ${f.shots.join(', ')}

Frontend files: ${REPO}/apps/riftbound-app/public/{css/gameplay.css, js/gameplay/*.js, gameplay.html, decks.html, login.html} and ${REPO}/apps/riftbound-app/server.ts

Rules:
- Read the relevant file, make minimal edit. CSS-only preferred (contrast/size/z-index/position).
- Do NOT rewrite whole files. If false-positive or too vague, applied=false.`,
      { label: `R${round} fix ${i}:${(f.area||'').slice(0,24)}`, phase: 'Fix', schema: FIX_SCHEMA }
    )
  ))
  const applied = fixed.filter(r=>r?.applied).length
  log(`R${round}: ${applied}/${toFix.length} fixes applied`)

  phase('Sync')
  await agent(
`Sync UI changes to the devbox. Do NOT kill or restart the server — the app hot-reloads static files.

Run exactly (with dangerouslyDisableSandbox:true since rsync/ssh need network):
  cd ${REPO} && rsync -a apps/riftbound-app/public/ emaynard-tcg:/root/tcg/tcg-engines/apps/riftbound-app/public/ && curl -sI --max-time 5 http://localhost:3000/play | head -1

Return ok=true if rsync exit 0 and curl returned 200.`,
    { label: `R${round} sync`, phase: 'Sync', schema: SYNC_SCHEMA }
  )

  rounds.push({round, total:flat.length, unique:deduped.length, high:highs.length, fixed:applied, topAreas:toFix.map(f=>f.area)})
  if (highs.length >= lastHighCount) stable++; else stable = 0
  lastHighCount = highs.length
  if (stable >= 3) { log(`R${round}: HIGH count stable for 3 rounds — stopping`); break }
}

return { rounds, finalHighCount: lastHighCount }
