export const meta = {
  name: 'riftbound-card-playtest',
  description: 'Per-card playtesting: N lane-agents, each with its own browser, tests a bucket of cards by tutoring each into hand and playing it.',
  phases: [
    { title: 'Playtest', detail: 'N lanes × M cards each' },
    { title: 'Verify', detail: 'skeptic per unique bug' },
  ],
}

const REPO = '/root/src/tcg/tcg-engines'
const A = typeof args === 'string' ? JSON.parse(args) : (args ?? {})
const CARD_LIST = A.cardList ?? '/tmp/card-list.json'
const CARD_IDS = A.cardIds ?? []
const N_LANES = A.lanes ?? 8

if (!CARD_IDS.length) throw new Error('args.cardIds required')

// Split cards into N buckets, one per lane, so browser sessions never collide.
const buckets = Array.from({length:N_LANES}, ()=>[])
CARD_IDS.forEach((id,i) => buckets[i % N_LANES].push(id))

const REPORT = { type:'object', properties:{
  reports:{type:'array',items:{type:'object',properties:{
    cardId:{type:'string'}, played:{type:'boolean'},
    bugs:{type:'array',items:{type:'object',properties:{
      what:{type:'string'}, expected:{type:'string'}, observed:{type:'string'}, layer:{type:'string',enum:['engine','server','ui','card']}
    },required:['what','expected','observed','layer']}},
    notes:{type:'string'}
  },required:['cardId','played','bugs']}}
}, required:['reports'] }
const VERDICT = { type:'object', properties:{verdict:{type:'string',enum:['CONFIRMED','REFUTED']},file:{type:'string'},reason:{type:'string'}}, required:['verdict','reason'] }

phase('Playtest')
log(`${CARD_IDS.length} cards in ${N_LANES} lanes (${buckets.map(b=>b.length).join('/')})`)

const laneResults = await parallel(buckets.map((bucket, lane) => () =>
  bucket.length === 0 ? {reports:[]} :
  agent(
`You are a playtester with a live browser session (lane ${lane}). Test each of these Riftbound cards ONE AT A TIME. For each: tutor it into hand, play it, do what its rulesText says should happen, and note anything that didn't work.

## Tools (use dangerouslyDisableSandbox for all Bash — unix socket + network)
Browser: \`pw() { bun /tmp/pwtest/pw-repl.ts --sock ${lane} "$@" 2>/dev/null; }\`
  pw click <sel>  |  pw drag <a> <b>  |  pw shot <path>  |  pw state  |  pw moves  |  pw eval <js>  |  pw errs  |  pw wait <ms>
Rule lookup: \`bun ${REPO}/.claude/skills/riftbound-rules/scripts/rule.ts <id>\`
Card def: \`python3 -c 'import json;c=json.load(open("${CARD_LIST}"));print(json.dumps([x for x in c if x["id"]=="<id>"][0],indent=2))'\` — gives {id,name,cardType,energyCost,rulesText,path}

## For EACH card in [${bucket.map(id=>`"${id}"`).join(', ')}]:

1. **Setup + tutor** (bash -c to avoid zsh):
   \`\`\`
   bash -c 'GID=$(bash /tmp/pwtest/setup-game.sh ${lane} 1 2>/dev/null | tail -1); curl -s -X POST "http://localhost:3000/api/game/\${GID}/tutor" -H "content-type: application/json" -d "{\\"defId\\":\\"<id>\\"}"'
   pw wait 500
   pw state    # card in hand? energy ≥ cost?
   pw moves    # play<Type> with params.cardId ending in <id>?
   \`\`\`
   If not playable → \`played:false, notes:"why"\`, next card.

2. **Play it**:
   \`pw eval 'executeMove("play<Type>", {"cardId":"<full-instance-id>","playerId":"player-1",...targets if listed}, "player-1")'\`
   Then \`pw wait 400\`, \`pw state\`, \`pw shot /tmp/card-<id>-played.png\`. **Read the screenshot.**

3. **Test the rulesText**: read what the card SAYS it does. Then:
   - Trigger on play/move/arrive? → check \`pw state\` for chain items or pendingChoice; if it targets, was there a prompt?
   - Activated ability? → \`pw moves\` should list activateAbility for it; try activating.
   - Modifies might/cost/state? → check the numbers.
   - "Choose"/"target"? → was a prompt shown (pendingChoice or per-target moves)?
   Screenshot after: \`pw shot /tmp/card-<id>-after.png\`. Read it.

4. **Report** for this card: played (bool), bugs[] (each: what/expected/observed/layer), notes (1 line).

Do NOT report "could be better". Report "the rulesText says X and Y happened instead". If everything matched, bugs=[].

Return {reports:[{cardId,played,bugs,notes}, ...]} — one entry per card.`,
    { label:`lane${lane} (${bucket.length} cards)`, phase:'Playtest', schema:REPORT }
  )
))

const reports = laneResults.filter(Boolean).flatMap(r=>r.reports||[])
const bugs = reports.flatMap(r => (r.bugs||[]).map(b => ({...b, cardId:r.cardId})))
log(`${reports.length}/${CARD_IDS.length} tested; ${reports.filter(r=>r.played).length} played; ${bugs.length} bugs`)

const uniq = new Map()
for (const b of bugs) {
  const k = (b.what||'').toLowerCase().replace(/\W+/g,' ').slice(0,60)
  if (!uniq.has(k)) uniq.set(k, {...b, cards:[]})
  uniq.get(k).cards.push(b.cardId)
}
const findings = [...uniq.values()].sort((a,b)=>b.cards.length-a.cards.length)

phase('Verify')
const verified = await parallel(findings.slice(0,25).map(f=>()=>
  agent(
`Verify. Default REFUTED without file:line.

Card ${f.cardId} — ${f.what}
Expected: ${f.expected}
Observed: ${f.observed}
Layer: ${f.layer}. Affects: ${f.cards.join(', ')}

Source: engine=${REPO}/packages/riftbound-engine/src/{game-definition,abilities}/; card def=\`grep -rl "${f.cardId}" ${REPO}/packages/riftbound-cards/src/\`; server=${REPO}/apps/riftbound-app/server.ts; ui=${REPO}/apps/riftbound-app/public/js/gameplay/
Rule: \`bun ${REPO}/.claude/skills/riftbound-rules/scripts/rule.ts <id>\``,
    { label:`verify ${f.cardId}`, phase:'Verify', schema:VERDICT }
  ).then(v=>({...f,...v}))
))

return {
  tested: reports.length, played: reports.filter(r=>r.played).length,
  notPlayed: reports.filter(r=>!r.played).map(r=>({id:r.cardId,notes:r.notes})),
  bugs: bugs.length, unique: findings.length,
  confirmed: verified.filter(v=>v?.verdict==='CONFIRMED'),
  refuted: verified.filter(v=>v?.verdict==='REFUTED').length,
  reports,
}
