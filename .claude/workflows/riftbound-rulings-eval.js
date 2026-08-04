export const meta = {
  name: 'riftbound-rulings-eval',
  description: 'Check whether the engine correctly implements each FAQ ruling in the train set.',
  phases: [
    { title: 'Evaluate', detail: 'one agent per ruling: read engine source + rule.ts, verdict' },
    { title: 'Summarize', detail: 'bucket by verdict' },
  ],
}

const REPO = '/root/src/tcg/tcg-engines'
const rulings = typeof args === 'string' ? JSON.parse(args) : Array.isArray(args) ? args : []

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: {type: 'string', enum: ['CORRECT','INCORRECT','NOT_IMPLEMENTED','CANNOT_DETERMINE']},
    engineHint: {type: 'string'},
    notes: {type: 'string'},
  },
  required: ['verdict','notes'],
}

phase('Evaluate')
log(`evaluating ${rulings.length} rulings`)

const results = await parallel(rulings.map(r => () =>
  agent(
`You are verifying whether the Riftbound engine at ${REPO}/packages/riftbound-engine/src/ correctly implements this official card ruling:

Card: ${r.cardName} (${r.cardId})
Question: ${r.question}
Official answer: ${r.answer}

Do:
1. Find the card definition: \`grep -rn "${r.cardId}\\|${r.cardName}" ${REPO}/packages/riftbound-cards/src/\` and check its abilities.
2. Look up cited rules: \`cd ${REPO} && bun .claude/skills/riftbound-rules/scripts/rule.ts <id>\`.
3. Read the relevant engine source (abilities/, chain/, combat/, game-definition/moves/, cleanup/) to determine if it would produce the official answer's outcome.

Return:
- CORRECT: engine would produce the ruling's outcome
- INCORRECT: engine would produce a DIFFERENT outcome (state what)
- NOT_IMPLEMENTED: the mechanic/card ability isn't wired up at all
- CANNOT_DETERMINE: too complex to trace statically

Include engineHint (file:line) and brief notes (≤4 sentences).`,
    {label: `${r.cardId} ${r.id.slice(0,6)}`, phase: 'Evaluate', schema: VERDICT_SCHEMA}
  ).then(v => ({id: r.id, cardId: r.cardId, cardName: r.cardName, question: r.question, ...v}))
))

phase('Summarize')
const clean = results.filter(Boolean)
const buckets = {CORRECT:[], INCORRECT:[], NOT_IMPLEMENTED:[], CANNOT_DETERMINE:[]}
for (const r of clean) buckets[r.verdict]?.push(r)

return {
  total: clean.length,
  counts: Object.fromEntries(Object.entries(buckets).map(([k,v])=>[k,v.length])),
  incorrect: buckets.INCORRECT.map(r=>({cardId:r.cardId, cardName:r.cardName, question:r.question, engineHint:r.engineHint, notes:r.notes})),
  notImplemented: buckets.NOT_IMPLEMENTED.map(r=>({cardId:r.cardId, cardName:r.cardName, question:r.question, engineHint:r.engineHint, notes:r.notes})),
  cannotDetermine: buckets.CANNOT_DETERMINE.map(r=>({cardId:r.cardId, question:r.question, notes:r.notes})),
}
