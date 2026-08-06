export const meta = {
  name: 'riftbound-monkey-expert',
  description: 'Naive monkey clicks the real UI; hard invariants + a rules-expert agent watch each step and call out anything wrong.',
  phases: [
    { title: 'Monkey', detail: 'random UI clicks/drags → trace.json + shots' },
    { title: 'Invariants', detail: 'driver-level hard checks (cost/pendingChoice/tapped/errs)' },
    { title: 'Watch', detail: 'expert reviews each before/after step' },
    { title: 'Verify', detail: 'skeptic per unique claim' },
  ],
}

const REPO = '/root/src/tcg/tcg-engines'
const MAX_ROUNDS = args?.rounds ?? 10
const STEPS = args?.steps ?? 40

const OK = { type:'object', properties:{ok:{type:'boolean'},steps:{type:'number'},dir:{type:'string'},seed:{type:'string'},notes:{type:'string'}}, required:['ok'] }
const INV = { type:'object', properties:{invariants:{type:'array',items:{type:'object',properties:{rule:{type:'string'},count:{type:'number'},steps:{type:'array',items:{type:'number'}},sample:{type:'string'}},required:['rule','count','sample']}}},required:['invariants'] }
const FINDINGS = { type:'object', properties:{findings:{type:'array',items:{type:'object',properties:{
  what:{type:'string'}, why_wrong:{type:'string'}, ruleOrCard:{type:'string'}, layer:{type:'string',enum:['engine','server','ui','card']}, severity:{type:'string',enum:['high','medium','low']}
},required:['what','why_wrong','ruleOrCard','layer','severity']}}},required:['findings'] }
const VERDICT = { type:'object', properties:{verdict:{type:'string',enum:['CONFIRMED','REFUTED']},file:{type:'string'},reason:{type:'string'}}, required:['verdict','reason'] }

const rounds = []
let stable = 0, last = 999

for (let R = 1; R <= MAX_ROUNDS; R++) {
  const DIR = `/tmp/monkey-R${R}`
  const seed = `mk${R}-${args?.seedBase ?? 'x'}`

  phase('Monkey')
  const drv = await agent(
`Run the monkey (dangerouslyDisableSandbox for chromium):
  rm -rf ${DIR} && cd /tmp/pwtest && bun monkey-drive.ts --steps ${STEPS} --seed ${seed} --out ${DIR} 2>&1 | tail -5
  python3 -c "import json;t=json.load(open('${DIR}/trace.json'));print(len(t['steps']))"
Return ok=true if trace.json has ≥10 steps; steps=<count>; dir=${DIR}; seed=${seed}.`,
    { label:`R${R} monkey`, phase:'Monkey', schema:OK })
  if (!drv?.ok) { rounds.push({round:R,error:'monkey-fail',notes:drv?.notes}); log(`R${R} monkey failed`); break }
  const N = drv.steps || STEPS
  log(`R${R}: ${N} steps at ${DIR} seed=${seed}`)

  // Driver-level hard invariants: read them straight out of trace.json and
  // surface BEFORE agent review — these are the "2-minute goldfish" bugs.
  phase('Invariants')
  const inv = await agent(
`Read ${DIR}/trace.json and return its top-level "invariants" array verbatim (rule, count, steps, sample). Do not interpret; just read the JSON.`,
    { label:`R${R} invariants`, phase:'Invariants', schema:INV })
  const invariants = inv?.invariants ?? []
  if (invariants.length) log(`R${R}: ${invariants.length} invariant rules violated: ${invariants.map(v=>v.rule).join(', ')}`)

  phase('Watch')
  const raw = await parallel(Array.from({length:N-1}, (_,i)=>i+1).map(i => () =>
    agent(
`You are a Riftbound rules expert watching a naive player. You know the rules; they don't. Your only job: did the game (UI/engine) behave correctly for what they just did?

References (use them):
- Rules digest: ${REPO}/.claude/skills/riftbound-rules/DIGEST.md
- Design intent: ${REPO}/.claude/skills/riftbound-rules/DESIGN.md
- Rule lookup: \`bun ${REPO}/.claude/skills/riftbound-rules/scripts/rule.ts <id>\`
- Card lookup: \`grep -rl "<def-id>" ${REPO}/packages/riftbound-cards/src/cards/\` then cat

The monkey's session is at ${DIR}/. Look at:
- Screenshot BEFORE: ${DIR}/${String(i-1).padStart(2,'0')}.png
- Screenshot AFTER: ${DIR}/${String(i).padStart(2,'0')}.png
- Read trace.json and extract steps[${i-1}] (before) and steps[${i}] (after). Each step has: {action, target, turn, runePools, energy, hand[], base[], runePool[], bfZones{}, moves[], pendingChoice, dom{}, errs[], invariantViolations[]}. hand/base entries include {name, cost, might, exhausted, rulesText}.

The monkey did: step ${i}'s action on step ${i}'s target.

Check SPECIFICALLY (a human notices these instantly):
1. **Mandatory prompts** — was any prompt/choice skippable that shouldn't be? If \`pendingChoice\` is set, was a modal shown (dom.pendingChoiceVisible/overlays) and were the offered \`moves\` restricted to resolvePendingChoice/concede only?
2. **Cost paid** — if a card left hand, did \`energy\` drop by ≥ its \`cost\`? Compare before.energy → after.energy against the played card's cost. Report if underpaid.
3. **Triggers fired** — if a card with "When I move/arrive/play/…" rulesText changed zones, did anything visibly happen (chain grew, pendingChoice set, hand/trash changed, prompt shown)?
4. **Enter tapped** — did any unit that just entered base/battlefield have exhausted=true (rule 143.4) AND is it visually rotated in the AFTER screenshot?
5. **Resource bar** — does dom.resourceBar match runePools.energy after the action?
6. Anything else wrong per the rules or a card's rulesText.

Report ≤3 things that are WRONG (not "could be better"). For each: what happened, why it's wrong (cite rule id or card name), which layer (engine/server/ui/card), severity. Return {findings:[]} if the game behaved correctly.`,
      { label:`R${R} watch@${i}`, phase:'Watch', schema:FINDINGS }
    ).then(r => (r?.findings||[]).map(f=>({...f, step:i})))
  ))
  const flat = raw.filter(Boolean).flat()
  const uniq = new Map()
  for (const f of flat) {
    const k = (f.ruleOrCard||f.what).toLowerCase().replace(/\W+/g,' ').trim().slice(0,60)
    if (!uniq.has(k)) uniq.set(k, {...f, count:0, steps:[]})
    const e = uniq.get(k); e.count++; if(!e.steps.includes(f.step)) e.steps.push(f.step)
  }
  // Fold driver invariants into the same verify pool (high severity, layer=engine).
  for (const v of invariants) {
    const k = `inv:${v.rule}`
    if (!uniq.has(k)) uniq.set(k, { what:`[invariant] ${v.rule}: ${v.sample}`, why_wrong:'driver hard-invariant', ruleOrCard:v.rule, layer:'engine', severity:'high', count:v.count, steps:v.steps||[], fromInvariant:true })
  }
  const findings = [...uniq.values()].sort((a,b)=>b.count-a.count)
  log(`R${R}: ${flat.length} raw + ${invariants.length} inv → ${findings.length} unique`)

  phase('Verify')
  const verified = await parallel(findings.map(f=>()=>
    agent(
`Adversarially verify. Default REFUTED unless you find the exact source line.

Claim (${f.layer}, seen at steps ${f.steps.join(',')}): ${f.what}
Why wrong: ${f.why_wrong}
Rule/card: ${f.ruleOrCard}

Check:
1. \`bun ${REPO}/.claude/skills/riftbound-rules/scripts/rule.ts <id>\` (if a rule)
2. Read the source: engine=${REPO}/packages/riftbound-engine/src/game-definition/moves/*.ts + abilities/, server=${REPO}/apps/riftbound-app/server.ts, ui=${REPO}/apps/riftbound-app/public/js/gameplay/, cards=${REPO}/packages/riftbound-cards/src/cards/
3. \`python3 -c "import json;t=json.load(open('${DIR}/trace.json'));print(json.dumps({'before':t['steps'][${(f.steps?.[0]??1)-1}],'after':t['steps'][${f.steps?.[0]??1}]},indent=2))"\`

CONFIRMED only with file:line.`,
      { label:`R${R} verify ${(f.ruleOrCard||'').slice(0,15)}`, phase:'Verify', schema:VERDICT }
    ).then(v=>({...f,...v}))
  ))
  const confirmed = verified.filter(v=>v?.verdict==='CONFIRMED')
  rounds.push({round:R, seed, invariants, raw:flat.length, unique:findings.length, confirmed:confirmed.length, findings:confirmed})
  log(`R${R}: ${confirmed.length} CONFIRMED (${invariants.length} from invariants)`)

  if (confirmed.length === 0 && invariants.length === 0) { log(`R${R}: clean — stopping`); break }
  if (confirmed.length >= last) { if (++stable >= 3) { log('stable 3 — stopping'); break } } else stable = 0
  last = confirmed.length
}

return { rounds }
