export const meta = {
  name: 'riftbound-test',
  description: 'Full Riftbound test pass: headless tracer invariants + monkey gameplay-flow + per-card playtest on N untested cards. Returns one merged report.',
  phases: [
    { title: 'Headless', detail: 'tracer 100 games → invariants (costViolation, moveFailed, enumErrors)' },
    { title: 'Monkey', detail: 'random UI clicks + hard invariants + expert' },
    { title: 'Cards', detail: 'per-card playtest on next N untested' },
    { title: 'Report' },
  ],
}

const REPO = '/root/src/tcg/tcg-engines'
const A = typeof args === 'string' ? JSON.parse(args) : (args ?? {})
const N_CARDS = A.cards ?? 48
const N_LANES = A.lanes ?? 12
const MONKEY_ROUNDS = A.monkeyRounds ?? 1
const SEED = A.seed ?? 'tcg-test'

const OK = { type:'object', properties:{ok:{type:'boolean'},summary:{type:'object'},notes:{type:'string'}}, required:['ok'] }
const CARDLIST = { type:'object', properties:{cardIds:{type:'array',items:{type:'string'}},remaining:{type:'number'}}, required:['cardIds'] }

// ───────────────────────── Headless tracer ─────────────────────────
phase('Headless')
const headless = await agent(
`Run the headless tracer + coverage check on the devbox (dangerouslyDisableSandbox for ssh):

  ssh emaynard-tcg 'cd ~/tcg/tcg-engines && export PATH=$HOME/.bun/bin:$PATH && rm -rf /tmp/tcg-test-traces && bun packages/riftbound-engine/src/testing/playtest/game-tracer.ts --games 100 --max-turns 60 --out /tmp/tcg-test-traces --seed ${SEED} --deck-strategy random 2>&1 | tail -3 && bun packages/riftbound-engine/src/testing/playtest/coverage-check.ts /tmp/tcg-test-traces 2>&1 | head -20'

Return ok=true and summary={moveFailed, enumErrors, costViolations, finished, defsInDecks, everPlayed} from the coverage output.`,
  { label:'headless tracer', phase:'Headless', schema:OK })

// ───────────────────────── Monkey (gameplay-flow) ─────────────────────────
phase('Monkey')
const monkey = MONKEY_ROUNDS > 0
  ? await workflow({scriptPath: `${REPO}/.claude/workflows/riftbound-monkey-expert.js`}, { rounds: MONKEY_ROUNDS, steps: 40, seedBase: SEED })
  : { rounds: [] }
const monkeyConfirmed = (monkey?.rounds ?? []).flatMap(r => r.findings ?? [])
const monkeyInvariants = (monkey?.rounds ?? []).flatMap(r => r.invariants ?? [])

// ───────────────────────── FAQ rulings (curated hard cases) ─────────────────────────
const rulingsResult = (A.rulings ?? 0) > 0
  ? await workflow({scriptPath: `${REPO}/.claude/workflows/riftbound-rulings-playtest.js`}, { limit: A.rulings, lanes: N_LANES })
  : { total:0, MATCHES:0, DIVERGES:0, diverges:[] }

// ───────────────────────── Per-card playtest ─────────────────────────
phase('Cards')
// Pick next N untested cards; caller can override with A.cardIds
const pick = A.cardIds ? { cardIds: A.cardIds, remaining: 0 } : await agent(
`Pick the next ${N_CARDS} untested cards. Read (both files exist):
  ${REPO}/.claude/skills/riftbound-rules/card-list.json  — all 786 unit/spell/gear with rulesText
  ${REPO}/.claude/skills/tcg-test/tested-cards.json      — {"tested":["id",...]} (create as {"tested":[]} if missing)

Return cardIds = first ${N_CARDS} ids in card-list.json NOT in tested-cards.json.tested (shuffled with seed "${SEED}"). Also return remaining = total untested count after this batch.`,
  { label:'pick cards', phase:'Cards', schema:CARDLIST })

const cards = pick?.cardIds ?? []
log(`card-playtest: ${cards.length} cards`)
const cardTest = cards.length
  ? await workflow({scriptPath: `${REPO}/.claude/workflows/riftbound-card-playtest.js`}, { cardIds: cards, lanes: N_LANES })
  : { tested:0, played:0, bugs:0, unique:0, confirmed:[], refuted:0, notPlayed:[] }

// ───────────────────────── Aggregate + update tracking ─────────────────────────
phase('Report')
await agent(
`Update tested-card tracking. Read ${REPO}/.claude/skills/tcg-test/tested-cards.json (create as {"tested":[]} if missing), append these ids (dedupe), write back:
${JSON.stringify(cards)}`,
  { label:'update tested-cards.json', phase:'Report', schema:OK })

const byLayer = {}
for (const c of [...(cardTest.confirmed||[]), ...monkeyConfirmed]) {
  byLayer[c.layer||'?'] = (byLayer[c.layer||'?']||0)+1
}

return {
  headless: headless?.summary ?? { ok:false, notes: headless?.notes },
  monkey: {
    rounds: (monkey?.rounds ?? []).length,
    invariants: monkeyInvariants,
    confirmed: monkeyConfirmed.length,
    findings: monkeyConfirmed,
  },
  cards: {
    tested: cardTest.tested, played: cardTest.played, bugs: cardTest.bugs,
    unique: cardTest.unique, confirmed: (cardTest.confirmed||[]).length,
    remaining: pick?.remaining ?? 0,
    notPlayed: cardTest.notPlayed,
    findings: cardTest.confirmed,
  },
  rulings: {
    total: rulingsResult.total, matches: rulingsResult.MATCHES,
    diverges: rulingsResult.DIVERGES, findings: rulingsResult.diverges,
  },
  byLayer,
  totalConfirmed: (cardTest.confirmed||[]).length + monkeyConfirmed.length + (rulingsResult.DIVERGES||0),
}
