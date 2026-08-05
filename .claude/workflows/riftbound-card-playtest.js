export const meta = {
  name: 'riftbound-card-playtest',
  description: 'One agent per card. Each agent reads the card, forces it into hand, plays it in the real UI, and reports what did not match the rulesText.',
  phases: [
    { title: 'Playtest', detail: 'per-card interactive session' },
    { title: 'Verify', detail: 'skeptic per unique claim' },
  ],
}

const REPO = '/root/src/tcg/tcg-engines'
const CARDS = args?.cards ?? []          // list of {id, name, cardType, rulesText, energyCost, domain, path}
const N_LANES = args?.lanes ?? 8         // number of parallel browser sessions
if (!CARDS.length) throw new Error('args.cards required')

const REPORT = { type:'object', properties:{
  cardId:{type:'string'}, played:{type:'boolean'},
  bugs:{type:'array',items:{type:'object',properties:{
    what:{type:'string'}, expected:{type:'string'}, observed:{type:'string'}, layer:{type:'string',enum:['engine','server','ui','card']}
  },required:['what','expected','observed','layer']}},
  notes:{type:'string'}
}, required:['cardId','played','bugs'] }
const VERDICT = { type:'object', properties:{verdict:{type:'string',enum:['CONFIRMED','REFUTED']},file:{type:'string'},reason:{type:'string'}}, required:['verdict','reason'] }

phase('Playtest')
log(`${CARDS.length} cards across ${N_LANES} lanes`)

const results = await parallel(CARDS.map((card, i) => () => {
  const lane = i % N_LANES
  return agent(
`You are playtesting ONE Riftbound card in a live goldfish game. You are both the player AND the rules judge.

## The card
id: ${card.id}
name: ${card.name}
type: ${card.cardType}
cost: ${card.energyCost}
domain: ${JSON.stringify(card.domain)}
rulesText: ${card.rulesText || '(no rules text)'}

Full definition: \`cat ${card.path}\`
Rules lookup: \`bun ${REPO}/.claude/skills/riftbound-rules/scripts/rule.ts <id>\`
Design intent: ${REPO}/.claude/skills/riftbound-rules/DESIGN.md + DIGEST.md

## Browser control (lane ${lane})
You have a persistent browser via \`pw <cmd>\` (dangerouslyDisableSandbox for the socket):
  pw() { bun /tmp/pwtest/pw-repl.ts --sock ${lane} "$@"; }
Commands: goto <url>, click <sel>, fill '<sel> <text>', drag <selA> <selB>, wait <ms>, shot <path>, state, moves, eval <js>, errs, reset

## Setup (run this once)
  bash /tmp/pwtest/setup-game.sh ${lane}    # login → goldfish → past mulligan; prints nothing useful yet
  GID=$(pw eval 'window.__rbGameId')
  curl -s -X POST http://localhost:3000/api/game/$GID/tutor -H content-type:application/json -d '{"defId":"${card.id}"}'
  pw state | python3 -m json.tool  # verify card is in hand

## Your task
1. Get the card into a playable state: tap runes (\`pw click '#player-runePool .card:not(.exhausted)'\` repeatedly, or \`pw eval\` to call executeMove) until you have enough energy${card.cardType === 'unit' ? ' + power' : ''}.
2. **Play the card via the UI** (click the sub-action or drag). Screenshot before and after: \`pw shot /tmp/card-${card.id}-before.png\` and \`...-after.png\`.
3. **Do what the card's rulesText says should happen**: if it triggers on move, move it; if it targets, was there a target prompt?; if it has an activated ability, activate it.
4. After each action: \`pw state\`, \`pw moves\`, \`pw errs\`, and screenshot. **Read the screenshots yourself** — the numbers on the resource bar, the card in the zone, the prompt overlay.

## Report
- played: did you actually get the card onto the board / resolved?
- bugs: for each thing that didn't match the rulesText or DESIGN.md — what/expected/observed/layer. Empty [] if everything worked.
- notes: 1-2 lines on what you tried.

Don't report "could be better". Report "the rulesText says X and Y happened instead".`,
    { label:`test ${card.id} ${card.name}`, phase:'Playtest', schema:REPORT }
  )
}))

const reports = results.filter(Boolean)
const bugs = reports.flatMap(r => (r.bugs||[]).map(b => ({...b, cardId:r.cardId, cardName:CARDS.find(c=>c.id===r.cardId)?.name})))
log(`${reports.length}/${CARDS.length} tested; ${reports.filter(r=>r.played).length} played; ${bugs.length} bugs`)

const uniq = new Map()
for (const b of bugs) {
  const k = (b.what||'').toLowerCase().replace(/\W+/g,' ').slice(0,60)
  if (!uniq.has(k)) uniq.set(k, {...b, cards:[]})
  uniq.get(k).cards.push(b.cardId)
}
const findings = [...uniq.values()].sort((a,b)=>b.cards.length-a.cards.length)

phase('Verify')
const verified = await parallel(findings.slice(0,20).map(f=>()=>
  agent(
`Verify. Default REFUTED without file:line.

Card ${f.cardId} (${f.cardName}) — ${f.what}
Expected: ${f.expected}
Observed: ${f.observed}
Layer: ${f.layer}. Affects ${f.cards.length} card(s): ${f.cards.slice(0,5).join(', ')}

Source: engine=${REPO}/packages/riftbound-engine/src/{game-definition,abilities}/; card=${REPO}/packages/riftbound-cards/src/cards/; server=${REPO}/apps/riftbound-app/server.ts; ui=${REPO}/apps/riftbound-app/public/js/gameplay/
Rule: \`bun ${REPO}/.claude/skills/riftbound-rules/scripts/rule.ts <id>\``,
    { label:`verify ${f.cardId}`, phase:'Verify', schema:VERDICT }
  ).then(v=>({...f,...v}))
))

return {
  tested: reports.length,
  played: reports.filter(r=>r.played).length,
  notPlayed: reports.filter(r=>!r.played).map(r=>({id:r.cardId,notes:r.notes})),
  bugs: bugs.length,
  confirmed: verified.filter(v=>v?.verdict==='CONFIRMED'),
  refuted: verified.filter(v=>v?.verdict==='REFUTED').length,
}
