---
name: riftjudge-engine-bridge
description: >-
  Always-answer a RiftJudge-style Riftbound: League of Legends TCG rules
  question. Concrete combat/Might questions get an engine-derived answer (run
  against the riftbound-engine); abstract rules-theory and mechanics outside the
  engine's vocab get a best-effort rules-text answer reasoned from the
  comprehensive rules — every question produces a verdict + confidence +
  assumptions, never "out of scope". Handles ambiguity via assumptions and
  multi-variant conditional answers. Trigger words: riftjudge, riftbound rules
  question, "what happens if", combat math, "does my unit die", "does the ability
  still resolve", "how does X work".
---

# riftjudge-engine-bridge — ALWAYS answer (two tracks, explicit uncertainty)

The bridge is a **two-track answerer with explicit uncertainty**. Given *any*
RiftJudge question it produces a coherent answer — even a wrong or low-confidence
one — and is honest about how sure it is. It **never** says "out of scope / can't
answer".

```
NL question
   │  (Stage 1 — you, the LLM, hand-build a `Scenario` with a `kind`)
   ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ kind: "engine-scenario"   ── Track A ──▶ build GameState, run the │
 │   (concrete board + a              riftbound-engine, render the   │
 │    mechanic in the vocab)          engine-derived answer.         │
 │                                                                  │
 │ kind: "rules-question"    ── Track B ──▶ you reason over the      │
 │ kind: "out-of-engine-scope"        comprehensive rules docs and  │
 │   (abstract theory, or a           write a best-effort answer    │
 │    board with an out-of-vocab      with rule cites + confidence. │
 │    mechanic)                                                     │
 │                                                                  │
 │ variants: [...]           ── run each variant, stitch into a     │
 │   (underspecified — one axis       conditional answer            │
 │    unknown)                        ("If A: …; if B: …").         │
 └──────────────────────────────────────────────────────────────────┘
   ▼
 every answer → a unified object → rendered text with the verdict, a
 Confidence line, ⚠️ Assumed/caveats, and (if conditional) "It depends" cases.
```

Run everything with **bun** (`~/.bun/bin/bun` or `export PATH="$HOME/.bun/bin:$PATH"`).
No npm/yarn.

## TL;DR — to answer a question

1. Read the question. By hand (you, the LLM), build a `Scenario` per the schema
   in `scripts/scenario-schema.ts`. **Pick its `kind` first** (see Stage 1).
2. Save it as JSON, then:
   ```bash
   cd ~/code/tcg-engines
   bun .claude/skills/riftjudge-engine-bridge/scripts/run.ts path/to/scenario.json
   # built-in demo (Sacrifice+Stupefy):
   bun .claude/skills/riftjudge-engine-bridge/scripts/run.ts --demo
   # the always-answer demo suite (8 scenarios across every type):
   bun .claude/skills/riftjudge-engine-bridge/scripts/run.ts --suite
   ```
3. The driver prints the structured scenario, then (for `engine-scenario`) the
   engine moves + step-by-step deltas, then the **rendered always-answer**. Relay
   that Stage-4 answer (lightly cleaned up) to the asker — including the
   confidence and any ⚠️ assumptions.

You can also call the library directly:
`import { answerScenario, renderUnifiedAnswer, renderScenarioAnswer } from "./scripts/render-answer"` —
`renderScenarioAnswer(scenario)` returns the rendered text for any `Scenario`.

## What a "RiftJudge question" is

People `!ask` RiftJudge (a Discord bot) Riftbound rules questions. Empirically
(~2141 sampled): ~41% are **abstract rules-theory** ("how does X work?", no
board), ~20% **concrete board with a mechanic outside the engine's vocabulary**,
~13% **chain/timing**, the rest scattered (movement, costs, keyword grants,
replacement effects, zone moves…). Only ~0.2% reduce to *pure* combat-math /
Might-threshold / damage-vs-Might-death — which is all Track A's engine can
compute. So **most questions go to Track B**, and that's fine — Track B always
gives an answer.

Each question implicitly has: a **premise** (board), **action(s)** (the move
sequence), and an **outcome** they want. For abstract questions there's no
board — that's a signal the question is `rules-question`.

## Stage 1 — Question → structured Scenario (DONE BY HAND, by you)

There is no NL parser. You read the question and fill in a `Scenario`. **First:
classify it** — set `kind`:

- **`"engine-scenario"`** — there's a concrete board (or one you can pin down)
  *and* the mechanic in question is in the engine's primitive vocabulary:
  Might modifications, buff counters, marked damage, killing a unit, drawing,
  or full combat resolution (incl. lethal/Tank ordering, conquer, win checks),
  plus `targetMighty` / `targetMightCompare` preconditions. → Track A: the
  driver builds a `GameState`, runs the engine, renders.
- **`"rules-demo"`** — an abstract "how does X work?" question (no concrete
  board) whose X is a mechanic the *engine* models: combat damage assignment /
  [Tank] / [Backline] priority, [Assault N] (attacker-only [M]), basic showdown
  / who-wins, Might floor at 0 (negative-Might questions), marked-damage-vs-Might
  state-based death, [Deathknell] firing on death, [Shield N] / [Hunt N] /
  [Stun] (runnable), [Deflect] / [Ambush] / [Quick-Draw] / [Tough] (narrative),
  and (batch 6) **`legion` / `when-i-attack` / `when-i-defend` / `on-conquer` /
  `on-play` / `on-equip`** — the trigger-shape topics that dominate the
  abstract-rules-theory bucket of RiftJudge questions. The bridge AUTO-BUILDS a
  minimal board demonstrating the rule and runs it through the engine — you
  just set `kind: "rules-demo"` and `demoTopic` (one of the topic keys above,
  or omit `demoTopic` and the bridge detects it from `questionText`). → Track A
  under the hood. See `scripts/rules-demo.ts` (`RULES_DEMO_TOPICS`) — add a topic
  by appending a builder there. **Prefer this over `rules-question` whenever the
  question reduces to one of those mechanics.**
- **`"rules-question"`** — abstract rules-theory, no usable board, and NOT a
  rules-demo topic ("can I X before Y?", chain/timing/priority rules, scoring/
  tiebreaker rules, deckbuilding). Do **not** invent a fake board. → Track B.
- **`"out-of-engine-scope"`** — there IS a board, but the mechanic isn't in the
  vocab: unit movement (Flash, Charm, Ride the Wind, recall…), keyword grants
  (Tank/Shield/Assault…), replacement/prevention ("would die"), copying,
  deck/hand/trash manipulation, cost/energy/exhaust timing, chain ordering,
  win-condition shenanigans. You may still fill in `premise` for context, set
  `whatsUnsupported` to a plain-words note of what the engine can't model. →
  Track B.

`kind` is optional for backward compat: if omitted and `premise` is present it's
treated as `"engine-scenario"`; with no board and no `kind` it's a
`"rules-question"`.

Then, per kind:

### For `engine-scenario` (Track A)

1. **Board (`premise`).** Each unit: stable `id`, `side` (`"me"` = asker,
   `"opp"` = opponent), printed `might`, optional real `name` (looked up in
   `@tcg/riftbound-cards`; non-real names get a synthesized stand-in + a note),
   optional `keywords`, optional `location` (`"base"` or a battlefield id you
   declare in `battlefields`), `damage`, `buffs`. Set `turnPlayer` to whoever
   takes the first action.
2. **Actions in RESOLUTION order.** Riftbound reactions resolve LIFO — the
   last-played reaction resolves first. So "I play Sacrifice, opp reacts with
   Stupefy" → list **Stupefy first**.
3. **Pick the right action primitive for each step** (each maps to one engine
   move): `modifyMight`→`modifyBuff`; `addBuff`→`addBuff×N`; `addDamage`→
   `addDamage` (lethal triggers death via the engine's state-based checks);
   `killUnit`→`killUnit`; `draw`→`drawCard`; `moveUnit`→`standardMove` (relocate
   onto a battlefield, also exhausts); `exhaustUnit`→`exhaustCard`;
   `grantKeyword`→the `grant-keyword` effect (appends to the unit's
   `grantedKeywords` meta — honored in combat damage assignment for
   [Tank]/[Backline], the +[M] of [Assault N]/[Shield N], static recalc, …;
   pair with `modifyMight` for an accompanying "+N Might"); `recallToBase`→the
   `recallUnit` reducer (Flash / "recall" / "return to base" — NOT a Standard
   Move: doesn't exhaust, doesn't fire move-triggers, and a unit recalled out of
   a Showdown leaves the combat); `replaceDeath`→appends a `{type:"replacement",
   replaces:"die",…}` ability to the unit (Zhonya's Hourglass / Tactical Retreat
   / Guardian Angel / Sett's legend — "the next time this unit would die,
   instead heal/exhaust/recall it"; `scope:"next"|"turn"|"static"`,
   `mode:"recall"|"prevent"`). The engine's death checks (`state-based-checks`,
   the `killUnit` move, the `kill` effect) consult `checkReplacement({type:"die"})`
   and skip the trash move when one matches — so a "kill" *cost* on such a unit
   is still considered paid (rule 357.2.a) and a unit saved this way never
   enters the trash, so its [Deathknell] won't fire (rule 808.1.d.1). A
   top-level `replaceDeath` action is treated as pre-existing setup (applied
   before any cost/action); a `replaceDeath` *inside* a `playSpell`'s `effects`
   is the protection being created by that spell mid-chain.
   `resolveCombat`→`resolveFullCombat` at a declared battlefield with a named
   attacker side; `playSpell`→a *named* spell wrapper with optional
   `additionalCosts` (paid pre-chain), optional resolution-time `condition`
   (e.g. `targetMighty`), and `effects` (a list of the primitives above).
4. Expand a real card's text into primitives at authoring time (see "Expanding
   card effects"). Anything the vocab can't express → use the closest
   primitives, put a `premise.notes` caveat, **and consider whether this should
   really be `out-of-engine-scope` instead**.
5. Set `question` (short phrase the renderer keys its verdict off — keep words
   like "die"/"survive"/"win"/"valid target") and `questionText` (verbatim).

### For `rules-question` / `out-of-engine-scope` (Track B)

You must author `rulesAnswer` — the bridge does **not** compute it; you do, by
**reasoning over the comprehensive rules** in
`~/code/tcg-engines/riftbound-rules/version-2026-03-30/` (numbered `.md` files —
the authoritative rules). Navigate them with the `riftbound-rules` skill's
indexes (`indexes/master-index.md`, `indexes/by-topic/`, `indexes/by-section/`)
to find the relevant sections, then read just those sections. Fill in:

- `verdict` — "yes" / "no" / "depends" / or the direct answer phrase.
- `reasoning` — the explanation, **citing specific rule numbers** from the
  version-2026-03-30 docs (e.g. "rule 342.1", "rule 459.2.b.1", "rule 143.2.a")
  and FAQ refs where the bot would. Multi-line OK.
- `cites` — the rule numbers / section ids you cited (surfaced as a "Rule cites:"
  line).
- `confidence` — be honest: `"high"` if the rules clearly settle it; `"medium"`
  if you're reasoning from analogy / card text you didn't verify; `"low/guess"`
  if the rules genuinely don't cover it — in which case **still answer**: "the
  rules don't explicitly address this; the most consistent reading is X".
- `assumptions` (optional) — anything you assumed (card text not pulled from
  `riftbound-cards`, which player is active, etc.).
- `conditionalCases` (optional) — if it's genuinely ambiguous, give the case
  split here ([{condition, outcome}, …]).

If you find yourself wanting to special-case a particular card's text, prefer
pulling that card's `rulesText`/abilities from `@tcg/riftbound-cards`
(`getCardRegistry()`) over hardcoding it in the answer.

### For underspecified questions (ambiguity → conditional answers)

Two tools, use either or both:

- **`assumptions: string[]`** on the Scenario — list what you had to assume
  (numbers you filled in, "a unit" with no Might, who's the active player).
  These surface loudly as "⚠️ Assumed / caveats" in the answer.
- **`variants: ScenarioVariant[]`** — when exactly one axis is unknown and the
  answer flips depending on it, give 2-3 concrete readings, each a full
  `Scenario` (no nesting), each with a human `label`. The driver runs every
  variant and the renderer produces a **conditional answer** ("It depends — if
  A: …; if B: …"). Variants work for both Track A (each variant is an
  engine-scenario) and Track B (each variant has its own `rulesAnswer`).

Example: "with two 4-Might units, does the opponent die?" — defender Might
unstated → two variants: `{label:"defender ≤ 8 Might (e.g. 5)", scenario:{…}}`
and `{label:"defender > 8 Might (e.g. 9)", scenario:{…}}`. Result: "It depends —
if ≤ 8 Might: yes it dies; if > 8: no."

### Expanding card effects into primitives (Track A)

The engine doesn't execute arbitrary card text — you translate it into the
primitive vocabulary:
- Stupefy ("Give a unit -1 Might this turn, min 1. Draw 1.") →
  `[{kind:"modifyMight",target:U,delta:-1}, {kind:"draw",side:S,count:1}]`.
- "Deal 2 damage to a unit" → `[{kind:"addDamage",target:U,amount:2}]`.
- "Move me to a battlefield" / Ambush placement / "play me to a battlefield" →
  `[{kind:"moveUnit",target:U,to:bfId}]` (engine: `standardMove` — also exhausts
  the unit, rule 596.3.a).
- "Flash" ("you may move me to base") / "recall a unit" / "return a unit to base"
  → `{kind:"recallToBase",target:U}` (engine: the `recallUnit` reducer, invoked
  directly since recalls aren't a discretionary move). A recall is **not** a
  Standard Move: it doesn't exhaust and doesn't fire move-triggers, and a unit
  recalled out of a Combat Showdown leaves the combat (so it dodges combat damage
  / a spell targeting units at that battlefield). NOTE: the bridge models the
  *movement* but not the chain-timing legality of *when* you could play such an
  effect — if the question hinges on the play-window (e.g. "can I play [Action]
  Ride the Wind in response to a spell?"), that's `out-of-engine-scope` / Track B.
- "Exhaust a friendly unit" (e.g. as Meditation's additional cost) →
  `{kind:"exhaustUnit",target:U}` (engine: `exhaustCard`).
- "The next time this unit would die, instead [heal/exhaust/recall it]" /
  "if it would die, [kill X / this gear] instead" — Zhonya's Hourglass /
  Tactical Retreat / Guardian Angel / Sett's legend →
  `{kind:"replaceDeath",target:U[,scope:"next"|"turn"|"static"][,mode:"recall"|"prevent"]}`
  (engine: appends a `{type:"replacement",replaces:"die",…}` ability to the
  unit's card definition). The engine treats any matched die-replacement as
  "skip the kill — keep the unit on the board" (it doesn't yet run the
  replacement's own heal/exhaust/recall body); a `"next"` replacement fires
  once then is consumed. Consequences the engine gets right: a "kill" *cost*
  (Sacrifice's "kill a friendly Mighty unit") on a `replaceDeath`'d unit is
  still considered paid (rule 357.2.a) so the spell resolves for full value
  while the unit survives; a unit saved this way never enters the trash, so its
  [Deathknell] won't fire (rule 808.1.d.1). A `replaceDeath` listed as a
  top-level action = pre-existing protection (applied before any cost/action);
  inside a `playSpell`'s `effects` = the protection being created by that spell.
- "<unit> gains [Keyword] (until end of turn / permanently)" — e.g. Yuumi
  granting [Tank], Blade of the Ruined King granting [Assault], etc. →
  `{kind:"grantKeyword",target:U,keyword:"Tank"[,value:N][,duration:"turn"|"permanent"]}`
  (engine: the `grant-keyword` effect). Pair with `{kind:"modifyMight",...}` if
  the card also grants "+N Might". The engine honors the granted keyword in
  combat damage assignment ([Tank]→assigned lethal first; [Backline]→last),
  in the +[M] of valued combat keywords ([Assault N] for attackers, [Shield N]
  for defenders), and in static-recalc.
- **Additional costs** ("As an additional cost, kill a friendly Mighty unit"):
  put them in `additionalCosts` on the `playSpell`, NOT in `effects` or
  `condition`. The driver pays every spell's `additionalCosts` in a **pre-pass**
  at play time, in play order (= reverse of the LIFO action list), *before* any
  action resolves — so a later-resolving Reaction can't undo a cost already paid
  (rule 357 / RiftJudge FAQ #9906). A unit-targeting effect whose target already
  left the board (e.g. it was killed to pay a cost) is reported as having no
  legal target. Sacrifice (UNL-173, "As an additional cost, kill a friendly
  Mighty unit. Draw 2, channel a rune.") →
  `additionalCosts:[{kind:"killUnit",target:friendlyMighty}]` +
  `effects:[{kind:"draw",side:S,count:2}]` — and remember Sacrifice kills a
  **friendly** Mighty unit; it can't target an enemy unit at all.
- `condition` is for **resolution-time** gates only (intervening-if / "valid
  target" checks), e.g. "kill a unit with 3 or less Might" → `condition:
  {kind:"targetMightCompare",target:U,op:"<=",value:3}`. Don't use it for costs.
- "die"-replacement effects (Zhonya's / Tactical Retreat / Guardian Angel /
  Sett) — **supported** via the `replaceDeath` primitive (see above). Other
  replacement events (replace "take-damage", "draw", "discard", "enters-ready"),
  copy effects, arbitrary zone moves (to deck/hand), and chain counters — the
  primitive vocab **cannot** express these. Don't fake it: use
  `kind:"out-of-engine-scope"` and answer via Track B.

## Stage 2-3 — build + run (automated, Track A only)

`scripts/build-scenario.ts`:
- `buildScenario(scenario)` builds a real `GameState` via the rules-audit
  helpers (`createMinimalGameState`/`createBattlefield`/`createCard` from
  `packages/riftbound-engine/src/__tests__/rules-audit/helpers.ts`). Both
  players get a fat rune pool so spell-cost checks never choke. (Throws if
  `scenario.premise` is missing — that's the signal to route to Track B.)
- `runScenario(scenario)` applies the actions via real engine moves, captures a
  state summary after each step (printed vs effective Might, zone, damage,
  alive/dead; battlefield controller/contested; winner/status) and an event log
  (might changes, buffs, damage, **deaths** — now emitted after *any* primitive
  that flips a unit to dead, not just `addDamage`/combat — combat outcomes,
  conquers, wins, spell fizzles). `playSpell` conditions are evaluated against
  live engine state; a failed condition fizzles the spell (no effects run).

## Stage 4 — unified answer (automated)

Every answer — Track A engine result, Track B `rulesAnswer`, single or
conditional — is normalized by `scripts/render-answer.ts` into a `UnifiedAnswer`:

```ts
{ verdict,                 // "yes" / "no" / "depends" / the answer phrase
  reasoning,               // Track A: engine-state deltas + final board.
                           // Track B: the rules-text reasoning. Conditional: per-case.
  assumptions: string[],   // surfaced loudly as "⚠️ Assumed / caveats"
  confidence,              // "high" | "medium" | "low/guess"
  conditionalCases?: [{ condition, outcome }],   // surfaced as "It depends — …"
  cites?: string[],        // rule cites (Track B)
  source: "engine" | "rules-reasoning" | "engine+rules" }
```

`answerScenario(scenario)` always returns one (it never throws — if a Track-A
engine run fails it degrades to the authored `rulesAnswer` or a low-confidence
stub). `renderUnifiedAnswer(scenario, ans)` renders it to clean text with the
verdict, a `Confidence: …  ·  Source: …` line, "It depends" cases up front for
conditionals, the reasoning, "Rule cites:", and "⚠️ Assumed / caveats:". Engine
answers default to `medium` confidence when stand-ins/caveats are present, `high`
otherwise.

## Files

- `scripts/scenario-schema.ts` — the `Scenario` schema (Stage 1 target):
  `kind`, `premise`/`actions` (Track A), `rulesAnswer`/`whatsUnsupported`
  (Track B), `assumptions`, `variants`, plus `UnifiedAnswer`.
- `scripts/build-scenario.ts` — Stage 2 + 3: build `GameState`, run moves,
  summarize state, log events. (Auto-expands a `kind:"rules-demo"` Scenario into
  a concrete `engine-scenario` via `rules-demo.ts` before building.)
- `scripts/rules-demo.ts` — the `rules-demo` Stage-1 mode: `RULES_DEMO_TOPICS`
  (per-topic minimal-scenario builders) + `expandRulesDemo` + `detectDemoTopic`.
  Add a topic by appending a builder; keep each demo SMALL so its outcome is
  unambiguous, and only add topics the engine genuinely models.
- `scripts/render-answer.ts` — Stage 4: Scenario → `UnifiedAnswer` → text.
  `answerScenario` / `renderUnifiedAnswer` / `renderScenarioAnswer` /
  `engineAnswer` / `rulesReasoningAnswer` / `conditionalAnswer`. Keeps the old
  `renderAnswer(run)` for backward compat.
- `scripts/run.ts` — the driver. `bun run.ts <scenario.json>` | `--demo` |
  `--suite`. Auto-detects `kind`; shows engine plumbing only for engine-scenarios.
- `scripts/demo-scenario.ts` — the canonical Sacrifice+Stupefy demo.
- `scripts/demo-suite.ts` — 8 hand-authored scenarios across every type
  (engine combat math, damage-vs-reduced-Might death, two underspecified→
  conditional, two abstract rules-questions, two out-of-engine-scope) — the
  always-answer demonstration. `bun run.ts --suite`.
- `examples/combat-math.scenario.json`, `examples/eval/p*.scenario.json` — older
  Track-A examples (still run; no `kind` → treated as engine-scenario).
- `examples/always-answer/*.scenario.json` — newer examples of the new kinds
  (conditional via variants, rules-question, out-of-engine-scope).

## Known limitations / TODO

- **Stage 1 is human-in-the-loop**; Track B's `rulesAnswer` is human-authored —
  the bridge gives it shape (verdict/cites/confidence/assumptions) and renders
  it, but doesn't generate it. Automating "find the rule + draft the answer"
  (e.g. a retrieval pass over the version-2026-03-30 docs) is the obvious next
  iteration. Right now Track B's correctness is bounded by how carefully the LLM
  reads the rules — hence the mandatory confidence flag.
- Engine vocab is small but growing: Might mods, buffs, damage, kill, draw,
  unit movement onto a battlefield (`moveUnit` → `standardMove`), exhaust
  (`exhaustUnit` → `exhaustCard`), full combat, plus `additionalCosts` on
  `playSpell` (paid pre-chain). Still NOT modelled: Flash-to-base / recall to
  base, keyword grants, replacement/prevention, copy, deck/hand/trash zone
  moves, energy/power costs, chain counters — those go to Track B
  (`out-of-engine-scope`), not faked in Track A.
- `playSpell` doesn't pay energy/power costs or run the real `playSpell` engine
  move — it pays the `additionalCosts` you list in a pre-pass (at play time),
  then applies the *resolved* `effects` you list (gated on an optional
  resolution-time `condition`). "Kill a Mighty unit as an additional cost" is
  now modelled as a pre-chain cost (`additionalCosts`), so a later Reaction
  can't undo it — the prior Sacrifice mismatch is fixed.
- Premise multi-buffs collapse to the engine's binary `buffed` flag (+1 Might);
  use `addBuff` actions for more.
- Dead units' temporary meta (mightModifier, buff, damage) is wiped when they
  hit the trash, so the final-board line for a dead unit reports just "DEAD"
  rather than a (stale) effective Might.

## Agentic mode (experimental — scaffolded in batch B-phase-B sub-A)

A second-track Stage 1 that drops the human-author-the-Scenario step entirely:
the LLM is given a tool catalogue (engine ops + rules search) and drives the
engine directly via the Anthropic Messages API tool-use loop. Each tool maps
to one engine helper (`playCard`, `attack`, `resolveCombat`, `setMight`,
`grantKeyword`, `queryBoard`, `getRulesText`, `searchRules`, etc.) and operates
on a shared `ToolContext` (a fresh `AuditEngine` + scratch maps).

### Files

- `scripts/agentic-types.ts` — `Tool`, `ToolContext`, `ToolResult` types.
- `scripts/agentic-tools.ts` — the tool catalogue. `buildToolCatalogue()`
  returns 27 tools; `createToolContext()` makes a fresh engine; `runTool(ctx,
  name, input)` invokes one and records into `ctx.trace`. All handlers return
  `{error: "..."}` on bad input rather than throwing — the loop can recover.
- `scripts/agentic-runner.ts` — drives Anthropic's tool-use loop with the
  catalogue. `runAgentic({premise, actions, question})` returns
  `{answer, confidence, trace, finishedVia, stepCount, inputTokens, outputTokens}`.
  Step cap defaults to 20; on cap or no-tool stops, the model's last text is
  taken as a low-confidence fallback. Default model `claude-opus-4-5`.

### Running

```bash
cd ~/code/tcg-engines
export PATH="$HOME/.bun/bin:$PATH"
# One p-file (prints trace + answer):
bun .claude/skills/riftjudge-engine-bridge/scripts/agentic-runner.ts \
  ~/riftjudge-problems/p0029.md
# Batch a list of p-files (writes /tmp/<outDir>/<pid>.json each):
bun .claude/skills/riftjudge-engine-bridge/scripts/agentic-runner.ts \
  --batch /tmp/agentic_out p0029.md p0035.md ...
```

API key: `ANTHROPIC_API_KEY` from env, or read from `~/.secrets.env` /
`~/.claude/secrets.env` (`ANTHROPIC_API_KEY_FALLBACK` is also picked up).

### Tools

State setup: `instantiateCard`, `placeOnBattlefield`, `placeInBase`,
`placeInHand`, `placeInTrash`, `createBattlefield`, `setMight`, `addCounter`,
`exhaust`, `ready`, `grantKeyword`, `setPower`, `setRunes`, `setActivePlayer`,
`beginPhase`, `advanceTurn`.

Actions: `playCard` (real cards-registry lookup → parsed abilities → dispatch
play-self/play-card/play-spell through the event bus), `activateAbility`,
`attack`, `declareDefender`, `resolveCombat`, `passFocus`.

Reads: `queryBoard` (full snapshot), `getRulesText` (card text + parsed
abilities count), `getAbilities` (full parsed-ability JSON), `searchRules`
(grep over `riftbound-rules/version-2026-03-30/*.md`).

Control: `finish(answer, confidence)` — the loop terminates when this fires.

### Caveats / TODO for the orchestrator merge

- The runner currently uses simple message accumulation (no prompt caching) —
  inputs grow O(N²) over the loop. A cache_control breakpoint on the system
  prompt + tool list would cut token cost substantially.
- The agent leans hard on `searchRules` / `getRulesText` and rarely constructs
  engine demos on its own. Tightening the system prompt to FAVOUR engine
  construction (and offering a few worked one-shots) is the next tuning lever.
- No retry on transient API errors; `errorDetail` is surfaced for the caller.
- Smoke test: 5/5 sample p-files reached `finish` via tool calls (mostly
  Track-B via rules search). Per-file traces in `/tmp/agentic_smoke_v7/`.

## Agentic mode v8 — few-shot examples, prompt caching, and scoring (batch 8-D)

Three additions on top of the batch-7 agentic scaffold:

1. **Few-shot examples** in `scripts/agentic-fewshot.ts` — six worked
   transcripts the system prompt injects after the policy block:
   - concrete combat + granted keyword (Quick-Draw)
   - on-play trigger / Legion-shaped (cardsPlayedThisTurn-gated)
   - abstract rules-demo (e.g. "how does Hidden work?")
   - specific named card lookup
   - chain/timing (LIFO resolution)
   - damage arithmetic (might / damage / buff interactions)
   Each example shows the SHAPE of a good run: small board → exact action →
   `queryBoard` → `finish`. The system prompt explicitly says
   "Prefer constructing a scenario with the engine over searching rules text —
   only fall back to searchRules if the question is purely conceptual."

2. **Prompt caching** via `cache_control: {type: "ephemeral"}` on the system
   prompt and the last tool in the catalogue. The system + tool block is
   constant per process so subsequent runs read from cache (~$1.50 / 1M
   tokens vs $15 / 1M uncached). `AgenticResult` now carries
   `cacheReadInputTokens` / `cacheCreationInputTokens` for observability.
   Measured cache hit rate on the v8 score sample is **~93%** of input
   tokens served from cache.

3. **Scoring on a 60-p-file stratified sample** in `scripts/score-agentic.ts`:
   ```bash
   cd ~/code/tcg-engines
   export PATH="$HOME/.bun/bin:$PATH"
   bun .claude/skills/riftjudge-engine-bridge/scripts/score-agentic.ts
   # Or smoke-test with smaller N:
   SCORE_AGENTIC_N=5 bun .claude/skills/riftjudge-engine-bridge/scripts/score-agentic.ts
   ```
   - Stratified across v6 buckets: 20 concrete-registered, 10 chain-timing,
     10 arithmetic, 10 demo-anchored, 10 single-card-lookup.
   - Writes `~/riftjudge-problems/_eval/agentic_score_v8/p####.json` (full
     trace) and `p####.score.json` (per-file scoring record), plus
     `agentic_score_v8_summary.{json,md}`.
   - Scoring: keyword-stem overlap with the bot's `## Answer` section.
     Strict = ≥60% of direction+content stems present (min 2). Loose =
     any answer-direction signal aligns. Manual-flag = bot answer unusable,
     very long, or multi-paragraph nuanced.
   - Tool-mix: counts engine vs rules-search vs finish per run. Reports
     `enginePct` per bucket so we can see whether the model actually drove
     the engine.

The step cap was lowered from 20 → 12 in v8 because runs that don't converge
by step 10 almost never converge by 20 — they just spend money on repeated
`searchRules` variants. The prompt now explicitly warns about repeating
queries.

## Agentic mode v9 — CLI + sub-agent (batch B-phase-B sub-G, supersedes v7/v8)

**The v7/v8 metered-API path above is REMOVED.** The team is on the Claude
Code Max subscription, where Agent-tool sub-agents are free; direct
`@anthropic-ai/sdk` calls are metered. v9 replaces the in-process
Anthropic-SDK tool-use loop with a CLI-driven flow: each agentic run is a
Claude Code sub-agent that drives the riftbridge engine through a thin
single-binary CLI which persists state to disk.

Files deleted: `agentic-runner.ts`, `agentic-tools.ts`, `agentic-types.ts`,
`agentic-fewshot.ts`, `score-agentic.ts`. The `@anthropic-ai/sdk` workspace
dependency is also removed.

### Files

- `scripts/riftbridge-state.ts` — the command catalogue + dispatcher.
  Exports `COMMANDS` (27 specs, one per engine op), `runCommand`,
  `replayCommands`, `freshCtx`, `commandHelp`, `READ_ONLY_COMMANDS`. State
  rehydration is via REPLAY: the on-disk state.json stores the ordered list
  of mutating commands, and every CLI invocation replays them against a
  fresh engine before applying the new command. Replay is deterministic,
  doesn't need engine-state serialization, and is well under 100ms for
  typical run sizes (~30 commands).
- `scripts/riftbridge.ts` — the CLI. Single bun binary:
  `bun riftbridge.ts <run-id> <subcommand> '<json-args>'`. Persists to
  `/tmp/riftbridge/<run-id>/state.json` (replay log), `log.txt` (per-call
  audit), `finish.json` (final answer). Errors → stderr + stdout
  `{"error":"..."}` and exit 1. Never throws uncaught.
- `scripts/agentic-orchestrator.ts` — the parent-side coordinator.
  - `prep <pfile>` — generates a run-id and prints a self-contained
    sub-agent prompt (policy + subcommand list + 6 worked examples +
    parsed p-file question) to stdout. The parent (Claude Code) reads
    this and dispatches it via the Agent tool.
  - `harvest <run-id>` — after the sub-agent finishes, reads
    `finish.json` + `log.txt` and emits a scored JSON record with
    answer, confidence, tool-mix breakdown (engine vs rules vs finish),
    bot-answer loose-match flag, and a truncated trace.
  - `list` — lists known run-ids under `/tmp/riftbridge/`.
- `scripts/_dryrun.ts` — simulates the sub-agent role for validation
  (no actual Agent dispatch). Two cases: `concrete` (full 2v2 combat
  through resolve-combat) and `abstract` (search-rules + finish).

### Subcommands (27 — same surface as the old tool catalogue)

State setup: `instantiate-card`, `place-on-battlefield`, `place-in-base`,
`place-in-hand`, `place-in-trash`, `create-battlefield`, `set-might`,
`add-counter`, `exhaust`, `ready`, `grant-keyword`, `set-power`,
`set-runes`, `set-active-player`, `begin-phase`, `advance-turn`.

Actions: `play-card`, `activate-ability`, `attack`, `declare-defender`,
`resolve-combat`, `pass-focus`.

Reads (NOT persisted to the replay log): `query-board`, `get-rules-text`,
`get-abilities`, `search-rules`.

Control: `new`, `finish`. `finish` writes `finish.json` and marks
`state.finished`.

Side identifiers in this CLI are `"P1"` (asker) / `"P2"` (opponent), to
mirror the engine's `PlayerId` constants (the v7/v8 catalogue used
`"me"` / `"opp"`).

### Running

```bash
export PATH="$HOME/.bun/bin:$PATH"
cd ~/code/tcg-engines

# Sanity-check the CLI directly:
bun .claude/skills/riftjudge-engine-bridge/scripts/riftbridge.ts --help

# Walk through a tiny session manually:
bun .claude/skills/riftjudge-engine-bridge/scripts/riftbridge.ts r1 new
bun .claude/skills/riftjudge-engine-bridge/scripts/riftbridge.ts r1 \
    create-battlefield '{"id":"bf1","controller":"P2"}'
bun .claude/skills/riftjudge-engine-bridge/scripts/riftbridge.ts r1 \
    instantiate-card '{"name":"Chemtech Enforcer","side":"P1"}'
# → {"cardId":"c0001",...}
bun .claude/skills/riftjudge-engine-bridge/scripts/riftbridge.ts r1 query-board

# Orchestrate a sub-agent run from a parent Claude Code session:
bun .claude/skills/riftjudge-engine-bridge/scripts/agentic-orchestrator.ts \
    prep ~/riftjudge-problems/p0001.md
# → prints the sub-agent prompt + RUN_ID. Parent dispatches an Agent with that prompt.

# After the Agent terminates:
bun .claude/skills/riftjudge-engine-bridge/scripts/agentic-orchestrator.ts \
    harvest <RUN_ID>
```

### Performance

Per-call wall-clock from cold bun ≈ 80-90ms (bun startup ~50ms +
replay+apply ~30ms). Internal replay+apply timing is sub-100ms even at the
end of a 30-call run. Real cost: free under Max — no API tokens consumed.

### Dryrun verification

`scripts/_dryrun.ts` exercises both shapes against real p-files:
`bun _dryrun.ts <run-id> concrete|abstract`. Concrete walks the engine
through a 2v2 combat (Chemtech Enforcer vs Legion Rearguard) and finishes
with a verdict; abstract searches rules for "Hidden" and finishes with a
rule-grounded answer. Harvest produces a coherent scored JSON for both.

### Fuzzy card-name lookup (added batch 10)

When the user's question mentions a card by a colloquial / partial name
(e.g. "rocket", "the +1 spell", "kha'zix"), call **`search-card-name`**
FIRST to resolve the canonical name; only then pass that exact name to
`instantiate-card` / `play-card` / `get-rules-text`. The lookup combines
substring match + word-overlap + token-prefix scoring; up to N matches
are returned with `{name, score, cardType, might}`.

```bash
bun .claude/skills/riftjudge-engine-bridge/scripts/riftbridge.ts r1 \
    search-card-name '{"query":"rocket","maxResults":5}'
# → {"matches":[{"name":"Rocket Barrage","score":542.86,...},
#               {"name":"Super Mega Death Rocket!","score":525,...}]}
```

The orchestrator-generated sub-agent prompt advertises this subcommand and
includes a worked example (EXAMPLE 6 — Fuzzy card-name resolution).
`search-card-name` is read-only and is never replayed onto state.

