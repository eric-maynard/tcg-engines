export const meta = {
  name: 'riftbound-ui-fixer',
  description: 'Apply source-code fixes for a batch of UI findings.',
  phases: [
    { title: 'Fix', detail: 'one agent per finding-cluster; edits CSS/JS/HTML' },
  ],
}

const REPO = '/root/src/tcg/tcg-engines'
const findings = (typeof args === 'string' ? JSON.parse(args) : Array.isArray(args) ? args : []).slice(0, 8)

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    applied: { type: 'boolean' },
    files: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['applied', 'notes'],
}

phase('Fix')
log(`fixing ${findings.length} findings`)

const results = await parallel(findings.map((f, i) => () =>
  agent(
`Repo: ${REPO}. Apply a UI fix to the riftbound-app frontend for this finding. Make surgical edits only.

Finding (severity ${f.severity}, area "${f.area}"):
  Issue: ${f.issue}
  Suggestion: ${f.suggestion || '(none given)'}
  Screenshots: ${(f.shots || []).join(', ')}

Frontend files:
  ${REPO}/apps/riftbound-app/public/css/gameplay.css
  ${REPO}/apps/riftbound-app/public/js/gameplay/{renderer,overlays,pregame,lobby,auth,state}.js
  ${REPO}/apps/riftbound-app/public/{gameplay,decks,login}.html

Rules:
- Read the relevant file(s), make the minimal edit that addresses the issue.
- CSS-only fixes are preferred where possible (contrast, sizing, spacing, z-index).
- Do NOT rewrite whole files or refactor.
- If the finding is a false positive (e.g., "opponent hand face-up" — that's intentional in goldfish mode), set applied=false and say why.
- If the finding is too vague or you can't locate the element, set applied=false.

Report: applied (bool), files touched (array), notes (≤2 sentences).`,
    { label: `fix ${i}: ${f.area?.slice(0,30)}`, phase: 'Fix', schema: RESULT_SCHEMA }
  ).then(r => ({ ...f, ...r }))
))

return {
  attempted: findings.length,
  applied: results.filter(r => r?.applied).length,
  results: results.filter(Boolean),
}
