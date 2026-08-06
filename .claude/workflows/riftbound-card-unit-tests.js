export const meta = {
  name: 'riftbound-card-unit-tests',
  description: 'Rules-expert agents write one harness-based unit test file per card (one test per rules clause); engine bugs recorded as test.failing("BUG: ...").',
  phases: [ { title: 'Write', detail: 'N lanes × M cards each' } ],
}
const REPO = '/root/src/tcg/tcg-engines'
const A = typeof args === 'string' ? JSON.parse(args) : (args ?? {})
const CARD_IDS = A.cardIds ?? []
const N_LANES = A.lanes ?? 8
const DEPTH = A.depth ?? 'standard'   // 'standard' | 'deep'
if (!CARD_IDS.length) throw new Error('args.cardIds required')
const buckets = Array.from({length:N_LANES}, ()=>[])
CARD_IDS.forEach((id,i)=>buckets[i%N_LANES].push(id))
const REPORT = {type:'object',properties:{results:{type:'array',items:{type:'object',properties:{
  cardId:{type:'string'}, file:{type:'string'}, clauses:{type:'number'}, passing:{type:'number'}, failingBugs:{type:'array',items:{type:'string'}}, skipped:{type:'string'}
},required:['cardId','clauses','passing','failingBugs']}}},required:['results']}
phase('Write')
log(`${CARD_IDS.length} cards in ${N_LANES} lanes`)
const out = await parallel(buckets.map((bucket,lane)=>()=> bucket.length===0?{results:[]}: agent(
`You are a Riftbound RULES EXPERT writing engine unit tests. For each card below, write ONE test file using ONLY the agent harness API. Headless — no browser, no server.

READ FIRST (once): ${REPO}/packages/riftbound-engine/src/__tests__/cards/README.md (the harness guide + policy), and skim 2 existing tests in that dir (e.g. ogn-251-298.test.ts, unl-186-219.test.ts) for style. Harness API: ${REPO}/packages/riftbound-engine/src/harness/{game,scenario,types}.ts. Rules: \`bun ${REPO}/.claude/skills/riftbound-rules/scripts/rule.ts <id|keyword>\`. Card def + rulesText: \`grep -rl "<id>" ${REPO}/packages/riftbound-cards/src/cards/\` then read it (abilities[] shows what the parser produced; rulesText is the source of truth).

${DEPTH==='deep' ? `DEEP MODE — quality over quantity. For each card, BEFORE writing, think like a head judge and list (in a comment at the top of the file) the 4–6 trickiest situations for THIS card: timing windows (showdown open/closed, opponent's turn, chain with 2+ items where order matters), replacement/"would" interplay, controller≠owner, simultaneous events ("first time", two deaths at once), hidden/facedown, zero/empty/max edge cases ("up to N" with 0 and N+1, no legal target, exactly-lethal vs one short), "this turn" expiry across game.advanceTurn(), cost edge cases (rainbow/pooled power, reducers to 0, mandatory additional costs unpayable), and its interaction with the 2–3 most natural partner/counter cards in its domains (look them up in the card list). Then write tests for THOSE plus the plain clauses: multi-step scenarios (play → respond → resolve → next turn; real combats with mixed keywords), explicit NEGATIVE-space tests (what must NOT happen on near-miss conditions), and one test that dumps the parsed abilities (registry payload) and asserts its structure matches the printed text (catches silent mis-parses). Target 8–14 tests per card; files may be up to ~220 lines. It is fine to spend 20+ minutes per card.\n\n` : ''}For EACH card in [${bucket.map(id=>`"${id}"`).join(', ')}]:
1. If \`${REPO}/packages/riftbound-engine/src/__tests__/cards/<id>.test.ts\` already exists → record skipped:"exists" and move on (do not overwrite).
2. Split rulesText into clauses (keywords w/ values, each trigger, each "Then/if" follow-up, activated abilities, statics, costs incl. power/accelerate/additional). Look up the governing rule for anything non-obvious.
3. Write \`<id>.test.ts\`: \`describe("<Name> (<id>)")\`, one \`test()\` per clause, built with \`scenario()\` (place the card + whatever board/enemy units/resources the clause needs; use real defIds for other cards, or FILLER units per README), act via seat verbs (play/cast/activate/move/tapRune/endTurn/answer/settle/advanceTurn), assert via state/zone/resources/chain/decision. Also include a cost test (correct energy+power deducted; unaffordable → not legal). Keep files focused (≤ ~120 lines).
4. Run \`cd ${REPO} && bun test packages/riftbound-engine/src/__tests__/cards/<id>.test.ts\`. For any clause that fails because the ENGINE/CARD is wrong (not your test): keep the exact assertion but wrap that test as \`test.failing("BUG: <one-line what's wrong>", ...)\` so the suite stays green and flips when fixed. If it fails because your test is wrong, fix the test. Never weaken an assertion to make it pass; never edit engine/card source; only create files under __tests__/cards/.
5. Final check per card: the file passes (\`0 fail\`).
Return {results:[{cardId,file,clauses,passing,failingBugs:[...BUG lines],skipped?}]}.`,
 {label:`lane${lane} (${bucket.length})`, phase:'Write', schema:REPORT})))
const results = out.filter(Boolean).flatMap(r=>r.results||[])
const bugs = results.flatMap(r=>(r.failingBugs||[]).map(b=>({cardId:r.cardId,bug:b})))
log(`${results.length} cards; ${results.filter(r=>!r.skipped).length} written; ${bugs.length} BUG clauses`)
const enq = await agent(`Run \`bun /root/src/tcg/tcg-engines/.claude/fix-queue/fix-queue.ts enqueue-bugs\` and return its output line.`, {label:'enqueue BUG tests', phase:'Write'})
log(`fix-queue: ${String(enq).slice(0,120)}`)
return { written: results.filter(r=>!r.skipped).length, skipped: results.filter(r=>r.skipped).length, clauses: results.reduce((a,r)=>a+(r.clauses||0),0), bugClauses: bugs.length, bugs, results }
