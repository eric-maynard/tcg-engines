/**
 * riftjudge-engine-bridge — Stage 1 schema (ALWAYS-ANSWER edition)
 *
 * The structured representation of a RiftJudge-style Riftbound rules question.
 *
 * A natural-language question implicitly has three parts:
 *   1. premise   — the board / game state setup (may be absent for abstract Qs)
 *   2. actions   — the move sequence being asked about (in play order)
 *   3. question  — what the asker wants to know
 *
 * Stage 1 (NL -> this object) is done BY HAND by an LLM following SKILL.md.
 * Stages 2-4 (this object -> engine state / rules reasoning -> run -> answer)
 * are partly automated by the scripts in this directory.
 *
 * KEY DESIGN GOAL (this edition): the bridge must produce *an* answer for EVERY
 * question — even a wrong/uncertain one — and be honest about confidence. So a
 * Scenario carries a `kind` that routes it to one of two answer tracks:
 *
 *   - `kind: "engine-scenario"`     -> Track A: build GameState, run the engine,
 *                                       render the engine-derived answer.
 *   - `kind: "rules-question"`      -> Track B: the invoking LLM reasons over the
 *     | "out-of-engine-scope"          rules docs and writes a best-effort answer
 *                                       with explicit confidence + rule cites.
 *
 * It also supports:
 *   - `assumptions: string[]`  — things the LLM had to assume (surfaced loudly).
 *   - `variants: ScenarioVariant[]` — when a question is underspecified along ONE
 *     axis (who's active player? what's the defender's Might?), run each variant
 *     and produce a *conditional* answer ("If A: …; if B: …").
 *
 * Design constraint (Track A): the engine is the source of truth for rules.
 * Scenario "effects" are a *small primitive vocabulary* that each map to one
 * engine move (or one engine setup helper). When a real Riftbound card's text is
 * more complex than a primitive, the LLM expands it into primitives at authoring
 * time (see SKILL.md "Expanding card effects").
 */

/** Engine player slots. Slot 1 ("me"/the asker) and slot 2 ("opponent"). */
export type Side = "me" | "opp";

/** How confident the answer is. */
export type Confidence = "high" | "medium" | "low/guess";

/**
 * Which answer track this Scenario routes to.
 *  - "engine-scenario"      — concrete board + a mechanic in the engine vocab.
 *                             Track A: build + run + render.
 *  - "rules-demo"           — abstract "how does X work?" question with NO board:
 *                             the bridge AUTO-CONSTRUCTS a minimal scenario that
 *                             demonstrates the rule (`demoTopic`), runs it
 *                             through the engine, and answers from the result.
 *                             Still Track A under the hood. See rules-demo.ts.
 *  - "rules-question"       — abstract rules-theory question, no usable board.
 *                             Track B: LLM reasons over rules docs.
 *  - "out-of-engine-scope"  — there IS a board, but the mechanic isn't in the
 *                             engine vocab (movement, keyword grant, replacement,
 *                             copy, zone moves, cost timing, chain ordering, …).
 *                             Track B, but `premise` may still carry the board
 *                             for context.
 */
export type ScenarioKind = "engine-scenario" | "rules-demo" | "rules-question" | "out-of-engine-scope";

/** A unit on the board in the premise. */
export interface PremiseUnit {
  /** Stable id used to reference this unit in actions (e.g. "myUnit"). */
  id: string;
  /** Who controls it. */
  side: Side;
  /** Printed Might. */
  might: number;
  /** Card name, for name->definition lookup and for the answer text. If
   *  the name isn't a real Riftbound card, a stand-in is synthesized. */
  name?: string;
  /** Keywords the unit has printed (e.g. ["Tank"], ["Assault"]). */
  keywords?: string[];
  /** Where the unit sits. "base" = its owner's base; or a battlefield id
   *  declared in `battlefields`. Defaults to "base". */
  location?: string;
  /** Pre-existing damage marked on it. */
  damage?: number;
  /** Pre-existing buff counters (+1 Might each). */
  buffs?: number;
}

/** A battlefield in the premise. */
export interface PremiseBattlefield {
  /** Stable id (e.g. "bf"). */
  id: string;
  /** Current controller, or null if uncontrolled. */
  controller?: Side | null;
  /** Is it already contested (i.e. opposing units present and combat pending). */
  contested?: boolean;
  /** If contested, which side is the attacker. */
  contestedBy?: Side;
}

export interface Premise {
  /** Whose turn it is. */
  turnPlayer: Side;
  units: PremiseUnit[];
  battlefields?: PremiseBattlefield[];
  /** Free-text notes the LLM wants to preserve (not consumed by the engine). */
  notes?: string;
}

// ---------------------------------------------------------------------------
// Action primitives. Each one maps to exactly one engine move or one engine
// setup operation. The driver applies them in order.
// ---------------------------------------------------------------------------

/** Reduce/increase a unit's Might for the rest of the turn (engine: modifyBuff). */
export interface ModifyMightAction {
  kind: "modifyMight";
  target: string; // premise unit id
  delta: number; // e.g. -1
  /** Card / effect name producing this, for the answer text. */
  source?: string;
}

/** Add buff counter(s) to a unit (engine: addBuff x N). */
export interface AddBuffAction {
  kind: "addBuff";
  target: string;
  count?: number; // default 1
  source?: string;
}

/** Mark damage on a unit (engine: addDamage). */
export interface AddDamageAction {
  kind: "addDamage";
  target: string;
  amount: number;
  source?: string;
}

/** Kill a unit outright — send it to trash (engine: killUnit). */
export interface KillUnitAction {
  kind: "killUnit";
  target: string;
  source?: string;
}

/** Draw cards for a side (engine: drawCard). Mostly cosmetic for answers. */
export interface DrawAction {
  kind: "draw";
  side: Side;
  count?: number; // default 1
  source?: string;
}

/**
 * Move a unit to a battlefield (engine: standardMove). Models "move me to a
 * battlefield", a Standard Move, or an effect that relocates a unit onto a
 * battlefield (Ambush placement, "play me to a battlefield", Charm-onto-a-
 * battlefield, etc.). A Standard Move also exhausts the unit (rule 596.3.a) —
 * the engine handles that. The destination battlefield must be declared in
 * `premise.battlefields`. (NOTE: moving back to *base* — Flash-to-base / recall
 * — isn't a Standard Move; use the `recallToBase` primitive for that.)
 */
export interface MoveUnitAction {
  kind: "moveUnit";
  target: string; // premise unit id
  to: string; // premise battlefield id
  source?: string;
}

/** Exhaust a unit (engine: exhaustCard). Models "exhaust a friendly unit" as an
 *  additional cost (Meditation), or any effect that exhausts a unit. */
export interface ExhaustUnitAction {
  kind: "exhaustUnit";
  target: string; // premise unit id
  source?: string;
}

/**
 * Grant a keyword to a unit (engine: the `grant-keyword` effect — the unit's
 * `grantedKeywords` meta gets the entry). Models "<unit> gains [Keyword]"
 * — e.g. Yuumi granting [Tank] (and you'd pair a `modifyMight`/`addBuff` for the
 * accompanying "+N Might"), Blade of the Ruined King granting [Assault], etc.
 * The engine then honors the granted keyword everywhere it checks keywords
 * (combat damage assignment for [Tank]/[Backline], the +[M] for [Assault N]/
 * [Shield N] in combat, static-recalc, …). `duration` defaults to "turn"
 * ("until end of turn"); use "permanent" for a permanent grant.
 */
export interface GrantKeywordAction {
  kind: "grantKeyword";
  target: string; // premise unit id
  keyword: string; // e.g. "Tank", "Assault", "Shield"
  /** Optional numeric value for valued keywords ([Assault 2], [Shield 1], …). */
  value?: number;
  /** "turn" (default — "until end of turn") | "permanent" | "combat". */
  duration?: "turn" | "permanent" | "combat";
  source?: string;
}

/**
 * Recall a unit to its owner's base (engine: the `recallUnit` reducer — recalls
 * are engine-internal, not a discretionary move, so the bridge invokes the
 * reducer directly). Models "Flash" ("you may move me to base"), "recall a
 * unit", "return a unit to base", and similar — distinct from `moveUnit`
 * (a Standard Move *onto* a battlefield, which exhausts). A recall to base
 * does NOT exhaust the unit and does NOT fire move-triggers. A unit recalled
 * out of a Combat Showdown leaves the combat (it's no longer at the battlefield),
 * so it can dodge combat damage / a spell that targets units at that battlefield.
 */
export interface RecallToBaseAction {
  kind: "recallToBase";
  target: string; // premise unit id
  source?: string;
}

/**
 * Give a unit a "die"-replacement effect (engine: a `{type:"replacement",
 * replaces:"die", …}` ability — the bridge re-registers the unit in the card
 * registry with the ability appended, which is what an "instead of dying…"
 * card text does). Models Zhonya's Hourglass / Tactical Retreat / Guardian
 * Angel / Sett's legend — "the next time this unit would die, instead
 * [heal/exhaust/recall it]" (or "prevent" — never let it die).
 *
 * `scope` (default `"next"`): a `"next"`-duration replacement fires ONCE then
 * is consumed (`draft.consumedNextReplacements`); `"turn"` fires repeatedly
 * this turn; `"static"`/`"permanent"` is always-on.
 *
 * `mode` (default `"recall"`): the engine currently treats *any* matched
 * die-replacement as "skip the kill — keep the unit on the board" (it doesn't
 * yet execute the replacement's own heal/exhaust/recall body), so `"recall"`
 * and `"prevent"` behave the same engine-side; the field is recorded for the
 * answer text ("instead of dying it's recalled to base" vs "its death is
 * prevented").
 *
 * Crucially: a "kill" *cost* (Sacrifice's "kill a friendly Mighty unit") that
 * is replaced by a die-replacement is STILL considered paid (rule 357.2.a) —
 * so a `playSpell` with `additionalCosts:[{kind:"killUnit",…}]` on a unit that
 * has `replaceDeath` resolves for full value while the unit survives. And a
 * unit saved this way never enters the trash, so its [Deathknell] does not
 * fire (rule 808.1.d.1).
 */
export interface ReplaceDeathAction {
  kind: "replaceDeath";
  target: string; // premise unit id — the unit that gets the protection
  /** "next" (default) | "turn" | "static" (= "permanent"). */
  scope?: "next" | "turn" | "static" | "permanent";
  /** "recall" (default — Zhonya's/GA-style "heal, exhaust, recall instead")
   *  | "prevent" (just don't let it die). Affects the answer text only. */
  mode?: "recall" | "prevent";
  source?: string;
}

/**
 * Play a real Riftbound card from the cards registry, instantiating it WITH its
 * parsed abilities attached, placing it onto the chosen zone, and dispatching
 * the `play-self` + `play-card` events through the engine's event bus so any
 * "when I'm played"/"when a card is played" listeners (legend buffs, Legion
 * triggers, "when you play a [type]" statics, etc.) fire through normal trigger
 * machinery. Costs are skipped (scenarios are constructed boards, not full
 * games with a rune economy); a scenario's question is "given this card
 * resolves, what happens?" — not "can I afford it?".
 *
 * `name` is looked up case-insensitively in `getCardRegistry()` from
 * `@tcg/riftbound-cards`; the looked-up card's parsed abilities, keywords,
 * might, energy/power cost, and type are all preserved on the registered
 * definition so the engine honors them everywhere (combat math, damage
 * assignment, static recalc, trigger fan-out). `instanceId` is the in-game
 * card-instance id used by later actions to reference this unit/spell.
 *
 * For UNIT/GEAR plays: the card is placed onto the chosen zone (`base` by
 * default, or `battlefield-<id>` if `to` names a premise battlefield), the
 * controller's `cardsPlayedThisTurn` counter is bumped (rule 555 / 724), and
 * both `play-self` and `play-card` events are dispatched.
 *
 * For SPELL plays: the card is placed in `trash` (resolved spells go to trash
 * by default — the bridge skips chain-stack modeling and resolves the spell
 * immediately). `play-card` + `play-spell` events are dispatched; the spell
 * effect itself isn't auto-executed (use this for triggers on "when you play
 * a spell"; for actual spell effects use `playSpell` with primitive `effects`).
 */
export interface PlayCardAction {
  kind: "playCard";
  /** Card name (case-insensitive). Looked up in `getCardRegistry()`. If not
   *  found, the action is a no-op (with a warning event). */
  name: string;
  /** Who plays the card. */
  side: Side;
  /** In-game id assigned to the instance (e.g. "myDarius"); later actions
   *  refer to the card by this id. Must not collide with a premise unit id. */
  instanceId: string;
  /** Destination zone: "base" (default for units/gear), "trash" (default for
   *  spells), or a battlefield id from `premise.battlefields` (places the
   *  unit directly at that battlefield — does NOT exhaust, since it's a
   *  Play, not a Standard Move). */
  to?: string;
}

/**
 * Resolve combat at a battlefield (engine: resolveFullCombat). The battlefield
 * is forced contested with the given attacker before resolving. This runs the
 * real combat resolver: mutual simultaneous damage, lethal/Tank ordering,
 * conquer / recall outcome.
 */
export interface ResolveCombatAction {
  kind: "resolveCombat";
  battlefield: string; // premise battlefield id
  attacker: Side;
  source?: string;
}

/**
 * Conditional spell resolution. The spell's effects only execute if a
 * condition currently holds. Used for cards like Sacrifice ("kill a friendly
 * Mighty unit as an additional cost" — needs the target to actually be Mighty)
 * where a prior reaction (Stupefy) can invalidate the precondition.
 *
 * If `condition` fails, the spell "fizzles": none of `effects` are applied,
 * and the answer reports it did nothing.
 */
export interface PlaySpellAction {
  kind: "playSpell";
  /** Card name (real Riftbound card if possible). */
  name: string;
  /** Who is playing it. */
  side: Side;
  /** Optional gating condition checked against current engine state — checked at
   *  RESOLUTION time. Use for "valid target" / intervening-if style gates, NOT
   *  for additional costs (those go in `additionalCosts`). */
  condition?: SpellCondition;
  /**
   * Additional costs paid WHEN THE SPELL IS PLAYED — i.e. *before* the spell is
   * put on the chain, and therefore before any opponent reaction (rule 357,
   * RiftJudge FAQ #9906). Modeled as primitive effects (e.g. "kill a friendly
   * Mighty unit" → `[{kind:"killUnit",target:U}]`). The driver applies all
   * `additionalCosts` of every spell in the action list in a *pre-pass*, in
   * play order (= reverse of the LIFO resolution order the actions are listed
   * in), so a later-resolving Reaction cannot undo a cost that was already paid.
   * Use this for "as an additional cost, …" cards like Sacrifice / Stupefy.
   */
  additionalCosts?: PrimitiveEffect[];
  /** Effects to apply if the condition holds (in order). These are the same
   *  primitive actions, minus nested playSpell. */
  effects: PrimitiveEffect[];
}

/** A condition checked before a spell's effects run. */
export type SpellCondition =
  /** Target unit must currently be "Mighty" (effective Might >= n, default 5). */
  | { kind: "targetMighty"; target: string; threshold?: number }
  /** Target unit must currently be alive / on the board. */
  | { kind: "targetAlive"; target: string }
  /** Target unit's effective Might must be >= / <= / == n. */
  | { kind: "targetMightCompare"; target: string; op: ">=" | "<=" | "=="; value: number };

export type PrimitiveEffect =
  | ModifyMightAction
  | AddBuffAction
  | AddDamageAction
  | KillUnitAction
  | DrawAction
  | MoveUnitAction
  | ExhaustUnitAction
  | GrantKeywordAction
  | RecallToBaseAction
  | ReplaceDeathAction
  | PlayCardAction
  | ResolveCombatAction;

export type ScenarioAction = PrimitiveEffect | PlaySpellAction;

// ---------------------------------------------------------------------------
// Track B — rules-reasoning answer (NEW)
// ---------------------------------------------------------------------------

/**
 * A pre-written rules-reasoning answer the invoking LLM produces by reasoning
 * over `riftbound-rules/version-2026-03-30/` (use the `riftbound-rules` skill's
 * indexes to find sections). Required for `rules-question` / `out-of-engine-scope`
 * Scenarios. The pipeline does NOT compute this — the LLM does — but the schema
 * shape forces honesty: verdict, reasoning with rule cites, confidence.
 *
 * The key requirement: this ALWAYS exists for Track B Scenarios. Never "out of
 * scope / can't answer". If the rules genuinely don't cover it, say so and give
 * the most consistent reading at "low/guess" confidence.
 */
export interface RulesAnswer {
  /** Short verdict: "yes" / "no" / "depends" / or the direct answer phrase. */
  verdict: string;
  /** The reasoning, with specific rule-number cites (e.g. "Rule 342.1", "Rule
   *  454.x") and/or FAQ refs the bot would use. Free text, can be multi-line. */
  reasoning: string;
  /** Rule numbers / section ids cited (e.g. ["342.1", "454.4", "800-Tank"]).
   *  Surfaced as a "Cites:" line. */
  cites?: string[];
  /** How confident this answer is. Be honest. */
  confidence: Confidence;
  /** Anything the LLM had to assume to answer. */
  assumptions?: string[];
  /** If the answer is genuinely conditional, the case split. */
  conditionalCases?: { condition: string; outcome: string }[];
}

// ---------------------------------------------------------------------------
// Variants — for underspecified questions (conditional answers)
// ---------------------------------------------------------------------------

/**
 * One concrete reading of an underspecified question. Each variant is a *full*
 * Scenario (recursively — but typically `kind:"engine-scenario"` with a board)
 * minus its own `variants` (no nesting). The driver runs every variant and the
 * renderer stitches the results into a conditional answer ("If A: …; if B: …").
 */
export interface ScenarioVariant {
  /** Human label for the condition this variant assumes ("You are the active
   *  player", "Their defender has 8 Might", …). */
  label: string;
  /** The concrete scenario for this reading. */
  scenario: Scenario;
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

export interface Scenario {
  /**
   * Which answer track. Optional for backward compat: if omitted and `premise`
   * is present, it's treated as "engine-scenario".
   */
  kind?: ScenarioKind;

  /** Original free-text question, verbatim. */
  questionText: string;

  /** What's being asked — short phrase. The renderer keys its answer to this. */
  question: string;

  // --- Track A fields (engine-scenario) ---
  /** The board. Required for engine-scenario; may still be present (for context)
   *  on out-of-engine-scope; omitted for pure rules-question. */
  premise?: Premise;
  /** Move sequence in play order (LIFO reactions should already be ordered so
   *  the *last-played, first-resolved* reaction comes first). */
  actions?: ScenarioAction[];

  // --- rules-demo field ---
  /** For `kind: "rules-demo"`: which mechanic to demonstrate. One of the keys
   *  in `RULES_DEMO_TOPICS` (rules-demo.ts) — e.g. "tank", "assault", "shield",
   *  "backline", "might floor", "marked damage", "deathknell", "showdown". If
   *  omitted, the bridge tries to detect a topic from `questionText`. */
  demoTopic?: string;

  // --- Track B fields (rules-question / out-of-engine-scope) ---
  /** The LLM's best-effort rules-reasoning answer. Required for Track B. */
  rulesAnswer?: RulesAnswer;
  /** For out-of-engine-scope: what mechanic the engine can't model, in plain
   *  words ("unit movement / Flash", "keyword grant", "chain ordering", …). */
  whatsUnsupported?: string;

  // --- Shared ---
  /** Things the LLM assumed when building this Scenario (numbers it filled in,
   *  who's the active player, "a unit" with no Might, …). Surfaced loudly in the
   *  answer ("⚠️ Assumed: …"). */
  assumptions?: string[];
  /**
   * For underspecified questions: multiple concrete readings. If non-empty, the
   * top-level `premise`/`actions`/`rulesAnswer` are ignored — the driver runs
   * each variant instead and the renderer produces a conditional answer.
   */
  variants?: ScenarioVariant[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the effective kind of a Scenario, applying the backward-compat default. */
export function scenarioKind(s: Scenario): ScenarioKind {
  if (s.kind) {
    return s.kind;
  }
  if (s.variants && s.variants.length > 0) {
    // A variant set without an explicit kind: take the first variant's kind.
    return scenarioKind(s.variants[0]!.scenario);
  }
  if (s.premise) {
    return "engine-scenario";
  }
  // No board and no kind — must be a rules question.
  return "rules-question";
}

// ---------------------------------------------------------------------------
// Unified answer object (Stage 4 target — see render-answer.ts)
// ---------------------------------------------------------------------------

/**
 * Every answer — Track A or Track B, single or conditional — is normalized into
 * this object before being rendered to text. This is what an invoking LLM relays
 * (lightly cleaned up) to the asker.
 */
export interface UnifiedAnswer {
  /** "yes" / "no" / "depends" / or the direct answer phrase. */
  verdict: string;
  /** The reasoning: for Track A, engine-state deltas; for Track B, rules-text
   *  reasoning with rule cites; for conditional, a summary + the cases. */
  reasoning: string;
  /** Things assumed. */
  assumptions: string[];
  /** Confidence. */
  confidence: Confidence;
  /** If conditional, the case split. */
  conditionalCases?: { condition: string; outcome: string }[];
  /** Rule cites (Track B) — empty for pure engine answers. */
  cites?: string[];
  /** Where the answer came from. */
  source: "engine" | "rules-reasoning" | "engine+rules";
}
