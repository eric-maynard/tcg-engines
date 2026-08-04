export const meta = {
  name: 'riftbound-ui-rules-loop',
  description: 'Rules/card correctness loop via live UI: drive → rule-judge → verify → fix → sync → bounce.',
  phases: [
    { title: 'Drive' }, { title: 'Judge' }, { title: 'Verify' }, { title: 'Fix' }, { title: 'Sync' },
  ],
}

const REPO = '/root/src/tcg/tcg-engines'
const DIR = '/tmp/rules-shots'
const MAX_ROUNDS = args?.rounds ?? 20
const CHECKS = [
  { key: 'resource', focus: 'Rules 315.3.b/430.4.a/413/414/160: exhaustRune adds energy? recycleRune adds power (NOT energy)? channel adds 2/turn? pools empty at end of turn?' },
  { key: 'play-legality', focus: 'Rules 308/309/419/357.1.a: server availableMoves matches what SHOULD be legal given zones/energy/hand? UI action list matches server moves?' },
  { key: 'turn-flow', focus: 'Rules 315-317: turn.number advances? Phases cycle? Hand +1/turn from draw? readyAll clears exhausted?' },
  { key: 'entry-state', focus: 'Rule 143.4/178.1.a.1/359.2.c: units enter base with meta.exhausted=true AND ui shows .card--exhausted? Gear/tokens enter correct zone?' },
  { key: 'card-behavior', focus: 'For cards in hand/board (see zones), do their abilities match rulesText? Triggers fire correctly (rule 383)? Effects don\'t hit wrong targets?' },
  { key: 'zone-transitions', focus: 'Rules 445/319/450: playUnit → base? standardMove → battlefield + showdown? Cards leave source zone?' },
  { key: 'ui-render', focus: 'Does the DOM (ui.*) reflect the state? runePoolCount == runePool zone size? baseCount matches? exhaustedRunes matches?' },
]
const FINDINGS = { type:'object', properties:{findings:{type:'array',items:{type:'object',properties:{ruleId:{type:'string'},severity:{type:'string',enum:['high','medium','low']},step:{type:'string'},expected:{type:'string'},observed:{type:'string'},layer:{type:'string',enum:['server','ui','engine','card']}},required:['ruleId','severity','expected','observed','layer']}}},required:['findings']}
const VERDICT = { type:'object', properties:{verdict:{type:'string',enum:['CONFIRMED','REFUTED']},reason:{type:'string'},file:{type:'string'},line:{type:'number'}}, required:['verdict','reason'] }
const FIX = { type:'object', properties:{applied:{type:'boolean'},files:{type:'array',items:{type:'string'}},notes:{type:'string'}}, required:['applied','notes'] }
const OK = { type:'object', properties:{ok:{type:'boolean'},steps:{type:'number'},notes:{type:'string'}}, required:['ok'] }

const rounds = []
let lastConfirmed = 999, stable = 0

for (let R = 1; R <= MAX_ROUNDS; R++) {
  phase('Drive')
  log(`=== ROUND ${R}: drive ===`)
  const drv = await agent(
`Run the rules driver. Use dangerouslyDisableSandbox:true for Bash (chromium+network).

  rm -rf ${DIR} && cd /tmp/pwtest && bun rules-drive.ts 2>&1 | tail -25
  wc -l ${DIR}/trace.json && python3 -c "import json;print(len(json.load(open('${DIR}/trace.json'))))"

Return ok=true if trace.json has ≥10 steps, and steps=<count>.`,
    { label: `R${R} drive`, phase: 'Drive', schema: OK })
  if (!drv?.ok) { log(`R${R}: driver failed`); rounds.push({round:R,error:'drive-fail',notes:drv?.notes}); break }
  const N = drv.steps || 17

  phase('Judge')
  const jobs = []
  for (const c of CHECKS) for (let i = 0; i < N; i++) jobs.push({c, i})
  log(`R${R}: ${jobs.length} judges`)
  const raw = await parallel(jobs.map(j => () =>
    agent(
`You are a Riftbound rules judge auditing a live game trace. Read ${REPO}/.claude/skills/riftbound-rules/DIGEST.md first.

Rule lookup: \`bun ${REPO}/.claude/skills/riftbound-rules/scripts/rule.ts <id>\`
Card lookup: \`grep -rl "<def-id>" ${REPO}/packages/riftbound-cards/src/cards/\` then cat.

**Focus**: ${j.c.key} — ${j.c.focus}

Read \`${DIR}/trace.json\` (JSON array). Extract entries [${j.i-1}] (before) and [${j.i}] (after). Each has {step,action,result,state:{turn,runePools,battlefields,zones,interaction},moves,ui}.
Also read ${REPO}/.claude/skills/riftbound-rules/DESIGN.md — the UI must match this design intent, not just be "not broken".

Does step ${j.i}'s action + resulting state comply with the rules for THIS focus? Report ≤2 concrete violations (rule id, expected per rule, observed from trace, layer=server|engine|ui|card), or [] if compliant.`,
      { label:`R${R} ${j.c.key}@${j.i}`, phase:'Judge', schema:FINDINGS }
    ).then(r => (r?.findings||[]).map(f=>({...f,check:j.c.key,stepIdx:j.i})))
  ))
  const flat = raw.filter(Boolean).flat()
  const byKey = new Map()
  for (const f of flat) {
    const k = `${(f.ruleId||'').split(/[^0-9.]/)[0]}|${f.layer}`
    if (!byKey.has(k)) byKey.set(k, {...f,count:0,steps:[]})
    const e = byKey.get(k); e.count++; if(!e.steps.includes(f.stepIdx)) e.steps.push(f.stepIdx)
  }
  const uniq = [...byKey.values()].sort((a,b)=>b.count-a.count)
  log(`R${R}: ${flat.length} raw → ${uniq.length} unique`)

  phase('Verify')
  const verified = await parallel(uniq.slice(0,15).map(f => () =>
    agent(
`Adversarially verify. Default REFUTED unless source confirms.

Rule ${f.ruleId} (layer ${f.layer}, seen at steps ${f.steps.join(',')}): expected "${f.expected}" observed "${f.observed}".

1. \`bun ${REPO}/.claude/skills/riftbound-rules/scripts/rule.ts ${(f.ruleId||'').split(/[^0-9.]/)[0]}\`
2. Read the source: server=${REPO}/apps/riftbound-app/server.ts, engine=${REPO}/packages/riftbound-engine/src/game-definition/moves/*.ts + abilities/*.ts, ui=${REPO}/apps/riftbound-app/public/js/gameplay/*.js, card=${REPO}/packages/riftbound-cards/src/cards/
3. Read step data: \`python3 -c "import json;t=json.load(open('${DIR}/trace.json'));print(json.dumps(t[${f.steps[0]}],indent=2))"\`
4. CONFIRMED only if you found the exact source line that produces the wrong behavior.`,
      { label:`R${R} verify ${f.ruleId}`, phase:'Verify', schema:VERDICT }
    ).then(v=>({...f,...v}))
  ))
  const confirmed = verified.filter(v=>v?.verdict==='CONFIRMED')
  log(`R${R}: ${confirmed.length} CONFIRMED / ${verified.length} verified`)

  if (confirmed.length === 0) { rounds.push({round:R,raw:flat.length,unique:uniq.length,confirmed:0}); log(`R${R}: 0 confirmed — stopping`); break }

  phase('Fix')
  const fixed = await parallel(confirmed.slice(0,6).map((f,i)=>()=>
    agent(
`Repo: ${REPO}. Apply a surgical fix for this CONFIRMED rules violation.

Rule ${f.ruleId} (layer ${f.layer}): ${f.expected} — but observed: ${f.observed}
Source: ${f.file}:${f.line||'?'}
Verifier reason: ${f.reason}

Read the file, make the minimal edit that brings behavior in line with the rule. Add a rule-id comment. If a card definition is wrong, fix packages/riftbound-cards/. If already fixed or false-positive, applied=false.`,
      { label:`R${R} fix ${i}:${f.ruleId}`, phase:'Fix', schema:FIX }
    )
  ))
  const applied = fixed.filter(r=>r?.applied).length

  phase('Sync')
  await agent(
`Sync engine+server+cards to devbox and bounce (use dangerouslyDisableSandbox:true):

  cd ${REPO} && rsync -a packages/riftbound-engine/src/ emaynard-tcg:/root/tcg/tcg-engines/packages/riftbound-engine/src/ && rsync -a packages/riftbound-cards/src/ emaynard-tcg:/root/tcg/tcg-engines/packages/riftbound-cards/src/ && rsync -a apps/riftbound-app/ emaynard-tcg:/root/tcg/tcg-engines/apps/riftbound-app/ --exclude data --exclude node_modules
  ssh emaynard-tcg 'cd ~/tcg/tcg-engines && ~/.bun/bin/bun test packages/riftbound-engine/src/__tests__/ 2>&1 | tail -3'

Then bounce: \`ssh emaynard-tcg 'kill $(cat /tmp/app.pid) 2>/dev/null; sleep 3; cat /tmp/app.pid'\` (a supervisor loop restarts it). Do NOT use pkill. Say ok=true if rsync succeeded and tests show 0 fail.`,
    { label:`R${R} sync`, phase:'Sync', schema:OK })

  rounds.push({round:R, raw:flat.length, unique:uniq.length, confirmed:confirmed.length, fixed:applied,
    findings:confirmed.map(c=>({ruleId:c.ruleId,layer:c.layer,file:c.file}))})
  if (confirmed.length >= lastConfirmed) stable++; else stable=0
  lastConfirmed = confirmed.length
  if (stable >= 3) { log(`R${R}: confirmed count stable 3 rounds — stopping`); break }
}

return { rounds, finalConfirmed: lastConfirmed }
