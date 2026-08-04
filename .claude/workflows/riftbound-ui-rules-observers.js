export const meta = {
  name: 'riftbound-ui-rules-observers',
  description: 'Rules/card-correctness audit of live UI gameplay: agents read trace.json (state+moves+UI) + screenshots and check each step against the rulebook.',
  phases: [
    { title: 'Observe', detail: 'per-step rules judges' },
    { title: 'Verify', detail: 'skeptic per unique finding' },
  ],
}

const REPO = '/root/src/tcg/tcg-engines'
const DIR = args?.dir ?? '/tmp/rules-shots'
const N_STEPS = args?.steps ?? 17

const CHECKS = [
  { key: 'resource', focus: 'Rules 515.3/592/594/160: does exhaustRune add energy? does recycleRune add power? does channel add 2 runes/turn? do pools empty at end of turn?' },
  { key: 'play-legality', focus: 'Rules 508/589: does the server availableMoves list match what SHOULD be legal per the rules given zones/energy/hand? Does the UI action list match server moves?' },
  { key: 'turn-flow', focus: 'Rules 515-517: does turn.number advance correctly? Do phases cycle awaken→beginning→channel→draw→main→ending? Does hand grow by 1/turn from draw?' },
  { key: 'card-behavior', focus: 'For cards actually in hand/board (see trace.zones), do their abilities/keywords match what the rules text says they should do when the relevant trigger happens?' },
  { key: 'zone-transitions', focus: 'Rules 596/319/450: playUnit → card in base? standardMove → card at battlefield + showdown opens? Cards removed from source zone?' },
]

const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: {
  type: 'object', properties: {
    ruleId: {type:'string'}, severity:{type:'string',enum:['high','medium','low']},
    step: {type:'string'}, action:{type:'string'},
    expected:{type:'string'}, observed:{type:'string'},
    layer:{type:'string',enum:['server','ui','engine','card']},
  }, required:['ruleId','severity','step','expected','observed','layer']
}}}, required:['findings'] }

const VERDICT = { type:'object', properties:{verdict:{type:'string',enum:['CONFIRMED','REFUTED']},reason:{type:'string'},file:{type:'string'}}, required:['verdict','reason'] }

phase('Observe')
const jobs = []
for (const check of CHECKS) for (let i = 0; i < N_STEPS; i++) jobs.push({check, i})
log(`${jobs.length} rule-check jobs (${N_STEPS} steps × ${CHECKS.length} checks)`)

const raw = await parallel(jobs.map(j => () =>
  agent(
`You are a Riftbound rules judge auditing a live game trace. First read ${REPO}/.claude/skills/riftbound-rules/DIGEST.md.

Rule lookup: \`bun ${REPO}/.claude/skills/riftbound-rules/scripts/rule.ts <id>\`
Card lookup: \`grep -rl "<def-id>" ${REPO}/packages/riftbound-cards/src/cards/\` then cat.

**Check focus**: ${j.check.key} — ${j.check.focus}

Read the full trace from \`${DIR}/trace.json\` (JSON array; ~100KB). Extract step ${j.i} and step ${j.i-1} (before). Each step has {step, action, result, state:{turn,runePools,battlefields,zones,interaction,pendingChoice}, moves:[{moveId,params}], ui:{...}}.

Then answer: does step ${j.i}'s action + resulting state comply with the rules for THIS check focus?

Report ≤2 concrete violations, or [] if compliant. Be specific: rule id, expected (per rule), observed (from trace), which layer is wrong (server=server.ts, engine=riftbound-engine, ui=renderer.js, card=riftbound-cards).`,
    { label: `${j.check.key}@${j.i}`, phase: 'Observe', schema: FINDINGS }
  ).then(r => (r?.findings||[]).map(f => ({...f, check:j.check.key, stepIdx:j.i})))
))

const flat = raw.filter(Boolean).flat()
const byRule = new Map()
for (const f of flat) {
  const k = `${f.ruleId}|${f.layer}`
  if (!byRule.has(k)) byRule.set(k, {...f, count:0, steps:[]})
  const e = byRule.get(k); e.count++; if(!e.steps.includes(f.step)) e.steps.push(f.step)
}
const uniq = [...byRule.values()].sort((a,b)=>b.count-a.count)
log(`${flat.length} raw → ${uniq.length} unique rule×layer`)

phase('Verify')
const verified = await parallel(uniq.slice(0, 20).map(f => () =>
  agent(
`Adversarially verify this UI-rules finding. Default REFUTED unless the source confirms it.

Rule ${f.ruleId} (layer ${f.layer}): expected "${f.expected}" observed "${f.observed}" at steps ${f.steps.join(',')}.

1. \`bun ${REPO}/.claude/skills/riftbound-rules/scripts/rule.ts ${f.ruleId.split(/[^0-9.]/)[0]}\`
2. Read the relevant source: server.ts \`${REPO}/apps/riftbound-app/server.ts\`, or engine \`${REPO}/packages/riftbound-engine/src/game-definition/moves/*.ts\`, or renderer \`${REPO}/apps/riftbound-app/public/js/gameplay/renderer.js\`
3. Point at the exact file:line if CONFIRMED.`,
    { label: `verify ${f.ruleId}`, phase: 'Verify', schema: VERDICT }
  ).then(v => ({...f, ...v}))
))

const confirmed = verified.filter(Boolean).filter(v=>v.verdict==='CONFIRMED')
return { total: flat.length, unique: uniq.length, confirmed, refuted: verified.filter(v=>v?.verdict==='REFUTED').length }
