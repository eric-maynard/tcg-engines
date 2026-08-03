export const meta = {
  name: 'riftbound-rule-observers',
  description: 'Fan out rule-observer agents over game traces, dedupe by ruleId, adversarially verify each unique finding.',
  phases: [
    { title: 'Observe', detail: '6 rule sections × 12 traces = 72 observers' },
    { title: 'Dedupe', detail: 'group by ruleId' },
    { title: 'Verify', detail: 'adversarial verifier per unique finding' },
  ],
}

const REPO = '/root/src/tcg/tcg-engines'
const TRACES = Array.from({length: 12}, (_, i) => `${REPO}/do_not_commit/wf-traces/game-wf-${i}.jsonl`)

const SECTIONS = [
  {n: 5, name: 'Turn Structure', rules: '500-526', focus: 'phase transitions, priority/focus, turn advancement, rune-pool timing (515.4.d, 517.2.c)'},
  {n: 6, name: 'Chains & Showdowns', rules: '527-563', focus: 'LIFO chain resolution, priority passing, showdown open/close, relevant players, focus passing'},
  {n: 7, name: 'Abilities', rules: '564-585', focus: 'triggered abilities go on chain, activated ability legality, replacement effects'},
  {n: 8, name: 'Game Actions', rules: '586-619', focus: 'move exhausts units, recycle destination, exhaust/ready state, discretionary vs directed'},
  {n: 9, name: 'Combat & Scoring', rules: '620-633', focus: 'attacker-first damage, contested clearing, conquer/hold once per bf per turn, final-point rule'},
  {n: 11, name: 'Keywords', rules: '712-729', focus: 'Hidden/Tank/Assault/Deathknell/etc firing correctly'},
]

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ruleId: {type: 'string'},
          severity: {type: 'string', enum: ['high','medium','low']},
          violation: {type: 'string'},
          evidence: {type: 'string'},
          seq: {type: 'number'},
          trace: {type: 'string'},
        },
        required: ['ruleId','severity','violation','evidence'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: {type: 'string', enum: ['CONFIRMED','PLAUSIBLE','REFUTED']},
    notes: {type: 'string'},
    engineHint: {type: 'string'},
  },
  required: ['verdict','notes'],
}

const ALREADY_FIXED = new Set(['140.1.b','140.1.c','508','508.1.a','509.1','548','553','589.1.a','627.4','160','517.2.c'])

phase('Observe')
const jobs = []
for (const sec of SECTIONS) {
  for (const trace of TRACES) {
    jobs.push({sec, trace})
  }
}
log(`launching ${jobs.length} observers`)

const observed = await parallel(jobs.map(({sec, trace}) => () =>
  agent(
`You are a Riftbound rules judge for section §${sec.n} ${sec.name} (rules ${sec.rules}).

Read \`${REPO}/.claude/skills/riftbound-rules/DIGEST.md\` first (~4KB overview).

Trace file (JSONL, one line per engine step with {seq,turn,phase,player,available,chosen,success,hand,state:{turn,status,pendingChoice,interaction,vp,runePools,battlefields}}):
  ${trace}

Rule lookup: \`cd ${REPO} && bun .claude/skills/riftbound-rules/scripts/rule.ts <id>\`. Use it — do NOT read reference chunks.

Scan the trace for violations of §${sec.n} rules ONLY. Focus: ${sec.focus}.

For each finding: ruleId (like "515.4.d"), severity, violation (what the rule says vs what happened), evidence (seq numbers + specific state values), trace filename.

SKIP anything already fixed on this branch (rules 140.1.b/c, 508, 509.1, 548, 553, 589.1.a, 627.4, 160, 517.2.c — neutral-open guards, contested clearing, all-player pool empty).

Return ≤6 findings. If nothing, return {findings:[]}.`,
    {label: `obs §${sec.n} ${trace.split('/').pop()}`, phase: 'Observe', schema: FINDINGS_SCHEMA}
  )
))

phase('Dedupe')
const all = observed.filter(Boolean).flatMap(r => r.findings || [])
log(`${all.length} raw findings from ${observed.filter(Boolean).length} observers`)

const byRule = new Map()
for (const f of all) {
  const key = f.ruleId.split('/')[0].trim()
  if (ALREADY_FIXED.has(key)) continue
  if (!byRule.has(key)) byRule.set(key, {count: 0, best: f, all: []})
  const e = byRule.get(key)
  e.count++
  e.all.push({trace: f.trace, seq: f.seq, ev: f.evidence?.slice(0,120)})
  if ((f.evidence?.length||0) > (e.best.evidence?.length||0)) e.best = f
}
const unique = [...byRule.entries()].map(([ruleId, e]) => ({ruleId, count: e.count, ...e.best, corroboration: e.all.slice(0,3)}))
log(`${unique.length} unique ruleIds after dedupe`)

phase('Verify')
const verified = await parallel(unique.map(f => () =>
  agent(
`Adversarially verify this Riftbound engine rules-violation claim. Default to REFUTED unless the evidence is concrete.

Claim (rule ${f.ruleId}, seen ${f.count}× across traces):
  Violation: ${f.violation}
  Evidence: ${f.evidence}
  Trace: ${f.trace} seq ${f.seq}

Do:
1. Run \`cd ${REPO} && bun .claude/skills/riftbound-rules/scripts/rule.ts ${f.ruleId}\` — does the rule actually say what the claim asserts?
2. Read the relevant engine source under \`${REPO}/packages/riftbound-engine/src/\` (grep for the move/function named in the evidence).
3. Read the trace line at ${f.trace} to confirm the state values.

Return verdict (CONFIRMED/PLAUSIBLE/REFUTED), notes (why), and engineHint (file:line if confirmed).`,
    {label: `verify ${f.ruleId}`, phase: 'Verify', schema: VERDICT_SCHEMA}
  ).then(v => ({...f, ...v}))
))

const confirmed = verified.filter(Boolean).filter(v => v.verdict !== 'REFUTED')
  .sort((a,b) => (b.count - a.count) || (a.severity < b.severity ? -1 : 1))

return {
  observers: jobs.length,
  rawFindings: all.length,
  uniqueRuleIds: unique.length,
  confirmed: confirmed.map(f => ({
    ruleId: f.ruleId, verdict: f.verdict, count: f.count, severity: f.severity,
    violation: f.violation, engineHint: f.engineHint, notes: f.notes,
  })),
  refuted: verified.filter(Boolean).filter(v => v.verdict === 'REFUTED').map(f => ({ruleId: f.ruleId, notes: f.notes})),
}
