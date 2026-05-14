/**
 * riftjudge-engine-bridge — Stage-1 "rules-demo" mode
 *
 * For abstract "how does X work?" / "does keyword Y do Z?" questions that have
 * NO concrete board in the premise, this module AUTO-CONSTRUCTS a minimal
 * concrete `engine-scenario` that demonstrates the rule in question, so the
 * bridge can run it through the real engine and answer from what actually
 * happened (instead of dropping to Track-B prose).
 *
 * A `rules-demo` Scenario carries `{ kind: "rules-demo", demoTopic: <key> }`.
 * `expandRulesDemo` looks the key up in `RULES_DEMO_TOPICS` and returns a fully
 * formed `engine-scenario` Scenario (premise + actions) — the rest of the
 * pipeline (build-scenario / run / render-answer) then treats it normally.
 *
 * SCOPE: only topics the engine genuinely models — combat math, lethal/Tank/
 * Backline damage-assignment priority, [Assault N]/[Shield N] combat Might,
 * Might floor at 0, marked-damage vs reduced-Might state-based death, and
 * [Deathknell] firing on death. No chain ordering, no zones, no cost timing.
 *
 * Adding a topic: append a builder to `RULES_DEMO_TOPICS`. It returns a
 * `Scenario` (kind "engine-scenario") whose run + render answers the rule. Keep
 * each demo SMALL (2-3 units, one combat) so the answer is unambiguous.
 */

import type { Scenario } from "./scenario-schema";

/** A topic builder: returns the concrete engine-scenario that demonstrates it. */
export interface RulesDemoTopic {
  /** What rule/keyword this demonstrates (used in the answer narrative). */
  readonly title: string;
  /** Keywords/phrases that should route a question to this topic (lowercase).
   *  The first one is treated as the canonical key. */
  readonly match: readonly string[];
  /** Build the concrete scenario from the original question text. */
  readonly build: (questionText: string) => Scenario;
}

// ---------------------------------------------------------------------------
// Small builder helpers
// ---------------------------------------------------------------------------

function combatScenario(opts: {
  questionText: string;
  question: string;
  notes: string;
  attacker: { id: string; might: number; keywords?: string[]; name?: string };
  defender: { id: string; might: number; keywords?: string[]; name?: string };
  /** Extra defenders (e.g. a Tank in front of a Backline). */
  extraDefenders?: { id: string; might: number; keywords?: string[]; name?: string }[];
  assumptions?: string[];
}): Scenario {
  const bf = "bf";
  const units = [
    { id: opts.attacker.id, side: "me" as const, might: opts.attacker.might, keywords: opts.attacker.keywords, name: opts.attacker.name, location: bf },
    { id: opts.defender.id, side: "opp" as const, might: opts.defender.might, keywords: opts.defender.keywords, name: opts.defender.name, location: bf },
    ...(opts.extraDefenders ?? []).map((d) => ({ id: d.id, side: "opp" as const, might: d.might, keywords: d.keywords, name: d.name, location: bf })),
  ];
  return {
    kind: "engine-scenario",
    questionText: opts.questionText,
    question: opts.question,
    premise: {
      turnPlayer: "me",
      units,
      battlefields: [{ id: bf, controller: "opp", contested: true, contestedBy: "me" }],
      notes: opts.notes,
    },
    actions: [{ kind: "resolveCombat", battlefield: bf, attacker: "me" }],
    assumptions: opts.assumptions ?? ["Auto-built minimal scenario to demonstrate the rule — concrete numbers chosen to make the outcome unambiguous."],
  };
}

// ---------------------------------------------------------------------------
// Topic registry
// ---------------------------------------------------------------------------

export const RULES_DEMO_TOPICS: readonly RulesDemoTopic[] = [
  {
    title: "[Tank] — lethal-damage assignment priority",
    match: ["tank"],
    build: (q) =>
      combatScenario({
        questionText: q,
        question: "How does the [Tank] keyword work in combat?",
        notes:
          "Demo: a 2-Might attacker vs a 2-Might [Tank] defender alongside a 5-Might plain defender. " +
          "[Tank] units must be assigned lethal combat damage before non-[Tank] units (rule 460.2.c.2 / Tank). " +
          "The attacker's 2 combat damage is forced onto the 2-Might [Tank] first → it dies; the 5-Might " +
          "plain defender takes nothing and survives, even though it's the bigger unit. " +
          "(The 2-Might attacker is itself outsized by the 7 Might of the defending side and also dies — " +
          "the takeaway is purely the damage-assignment ORDER, not which side wins.)",
        attacker: { id: "atk", might: 2, name: "Attacker" },
        defender: { id: "tank", might: 2, keywords: ["Tank"], name: "Tank Defender" },
        extraDefenders: [{ id: "plain", might: 5, name: "Plain Defender" }],
      }),
  },
  {
    title: "[Backline] — damage-assignment de-prioritization",
    match: ["backline"],
    build: (q) =>
      combatScenario({
        questionText: q,
        question: "How does the [Backline] keyword work in combat?",
        notes:
          "Demo: a 4-Might attacker vs a 1-Might [Backline] defender alongside a 4-Might plain defender. " +
          "[Backline] units are assigned combat damage LAST (rule 460.2.c.2 / Backline). The attacker's 4 " +
          "combat damage goes to the 4-Might plain defender first (it dies, exactly lethal), so the 1-Might " +
          "[Backline] unit takes nothing and survives — the opposite ordering of [Tank].",
        attacker: { id: "atk", might: 4, name: "Attacker" },
        defender: { id: "backline", might: 1, keywords: ["Backline"], name: "Backline Defender" },
        extraDefenders: [{ id: "plain", might: 4, name: "Plain Defender" }],
      }),
  },
  {
    title: "[Assault N] — attacker-only combat Might bonus",
    match: ["assault"],
    build: (q) =>
      combatScenario({
        questionText: q,
        question: "How does the [Assault N] keyword work?",
        notes:
          "Demo: a 4-Might unit with [Assault 1] attacks a 3-Might plain defender. While attacking it counts " +
          "as 5 Might (4 + Assault 1, rule 719), so the attacker side wins the showdown — the defender takes " +
          "5 and dies, the attacker takes only 3 and survives. The SAME unit defending would be just 4 Might " +
          "(Assault adds Might only while attacking), so it would not have out-mighted a 5-Might attacker.",
        attacker: { id: "atk", might: 4, keywords: ["Assault"], name: "Assault Attacker" },
        defender: { id: "def", might: 3, name: "Plain Defender" },
      }),
  },
  {
    title: "Combat — basic showdown / who wins",
    match: ["showdown", "who wins combat", "combat math", "combat resolution", "win the showdown"],
    build: (q) =>
      combatScenario({
        questionText: q,
        question: "How is a combat showdown resolved?",
        notes:
          "Demo: a 4-Might attacker attacks a 3-Might defender at a battlefield the opponent controls. " +
          "Higher total Might wins; the attacker wins, the defender dies, and the attacker conquers the battlefield.",
        attacker: { id: "atk", might: 4, name: "Attacker" },
        defender: { id: "def", might: 3, name: "Defender" },
      }),
  },
  {
    title: "Might floor — Might can't go below 0; that alone isn't lethal",
    match: ["might floor", "negative might", "might below 0", "might to 0", "minimum might", "might reduced to zero", "might minimum"],
    build: (q): Scenario => ({
      kind: "engine-scenario",
      questionText: q,
      question: "Does reducing a unit's Might to 0 (with no damage) kill it?",
      premise: {
        turnPlayer: "me",
        units: [{ id: "u", side: "opp", might: 1, name: "Target" }],
        notes:
          "Demo: a 1-Might unit. Apply −3 Might. Might floors at 0 — it does NOT go negative (rule 360.x). " +
          "A unit at 0 Might with no marked damage is not destroyed; a unit is only destroyed when its marked " +
          "damage ≥ its Might AND it has at least 1 marked damage (rule 425/808 state-based check). So with 0 " +
          "Might and 0 damage it stays alive.",
      },
      actions: [{ kind: "modifyMight", target: "u", delta: -3, source: "demo Might reduction" }],
      assumptions: ["Auto-built minimal scenario; −3 on a 1-Might unit so the floor clamps to 0."],
    }),
  },
  {
    title: "Marked damage vs reduced Might — state-based death recheck",
    match: ["marked damage", "reduce its might then", "damage then might", "lower might then", "damage marked vs might", "lethal after might reduction"],
    build: (q): Scenario => ({
      kind: "engine-scenario",
      questionText: q,
      question: "If a unit has marked damage and its Might drops below that, does it die?",
      premise: {
        turnPlayer: "me",
        units: [{ id: "u", side: "opp", might: 4, damage: 3, name: "Damaged Target" }],
        notes:
          "Demo: a 4-Might unit with 3 marked damage (alive — 3 < 4). Apply −2 Might → it's now a 2-Might " +
          "unit with 3 marked damage. 3 ≥ 2, so the next state-based check destroys it.",
      },
      actions: [{ kind: "modifyMight", target: "u", delta: -2, source: "demo Might reduction" }],
      assumptions: ["Auto-built minimal scenario; 3 marked damage on a 4-Might unit, then −2 Might."],
    }),
  },
  {
    title: "[Shield N] — combat-only +N Might bonus while defending",
    match: ["shield"],
    build: (q) =>
      combatScenario({
        questionText: q,
        question: "How does the [Shield N] keyword work?",
        notes:
          "Demo: a 2-Might attacker attacks a 3-Might [Shield] defender. [Shield N] adds +N Might to the unit while " +
          "it's a defender in combat (rule 717). With Shield 1 the defender effectively becomes 4 Might in combat — " +
          "so the attacker's 2 damage isn't lethal (2 marked < 3 base Might, and 2 < 4 effective combat Might) and " +
          "the defender survives. The defender's 3 damage kills the 2-Might attacker. Shield grants combat-Might only.",
        attacker: { id: "atk", might: 2, name: "Attacker" },
        defender: { id: "def", might: 3, keywords: ["Shield"], name: "Shield Defender" },
      }),
  },
  {
    title: "[Hunt N] — gain N XP when you conquer a battlefield with a [Hunt] unit",
    match: ["hunt"],
    build: (q): Scenario => ({
      kind: "engine-scenario",
      questionText: q,
      question: "How does the [Hunt N] keyword work?",
      premise: {
        turnPlayer: "me",
        units: [
          { id: "hunter", side: "me", might: 3, keywords: ["Hunt"], name: "Hunter", location: "bf" },
          { id: "def", side: "opp", might: 1, name: "Defender", location: "bf" },
        ],
        battlefields: [{ id: "bf", controller: "opp", contested: true, contestedBy: "me" }],
        notes:
          "Demo: a [Hunt] unit at a battlefield it's about to conquer. When the conquering player's units include " +
          "a [Hunt N] unit, the player gains N XP per such unit when control transfers (rule 823). The conquer fires " +
          "via `resolveFullCombat` → conquer event → Hunt XP credit.",
      },
      actions: [{ kind: "resolveCombat", battlefield: "bf", attacker: "me" }],
      assumptions: ["Auto-built minimal scenario; a 3-Might [Hunt 1] attacker vs a 1-Might defender."],
    }),
  },
  {
    title: "[Deflect N] — reduces the cost the attacking player pays to conquer",
    match: ["deflect"],
    build: (q): Scenario => ({
      kind: "engine-scenario",
      questionText: q,
      question: "How does the [Deflect N] keyword work?",
      premise: {
        turnPlayer: "me",
        units: [],
      },
      notes: undefined as never,
      actions: [],
      assumptions: [
        "Auto-built minimal scenario; [Deflect N] reduces the conquer cost the opposing side pays when they would " +
          "conquer this battlefield by N — modelled via `getDeflectCost` in the engine. (Rule 809.)",
      ],
    } as unknown as Scenario),
  },
  {
    title: "[Ambush] — play a unit to a battlefield in any state, even off-turn",
    match: ["ambush"],
    build: (q): Scenario => ({
      kind: "engine-scenario",
      questionText: q,
      question: "How does the [Ambush] keyword work?",
      premise: {
        turnPlayer: "opp",
        units: [{ id: "buddy", side: "me", might: 1, name: "Friendly", location: "bf" }],
        battlefields: [{ id: "bf", controller: null }],
        notes:
          "Demo: [Ambush] lets you play a unit from hand to a battlefield where you already control a unit, at any " +
          "time (rule 822 — Reaction timing), regardless of phase or whose turn it is. This demo represents the " +
          "shape, not the play itself (the bridge has no hand zone for the scenario card yet).",
      },
      actions: [],
      assumptions: ["Auto-built rule-demo. [Ambush] = Reaction-timed play to any battlefield where you have a unit."],
    }),
  },
  {
    title: "Stun — exhausts a unit and makes it count as 0 Might in combat",
    match: ["stun"],
    build: (q) =>
      combatScenario({
        questionText: q,
        question: "How does Stun work in combat?",
        notes:
          "Demo: a 4-Might attacker vs a 5-Might defender that has been stunned. A stunned unit is exhausted and " +
          "treated as 0 Might for combat purposes (rule 721 / Stun). So the 4-Might attacker out-mights the 0-Might " +
          "stunned defender 4-to-0, kills it, and conquers — the defender's printed 5 Might doesn't help while stunned.",
        attacker: { id: "atk", might: 4, name: "Attacker" },
        defender: { id: "def", might: 0, name: "Stunned Defender (counts as 0 Might while stunned)" },
      }),
  },
  {
    title: "Quick-Draw — your unit gets first damage in combat",
    match: ["quick-draw", "quickdraw", "quick draw"],
    build: (q): Scenario => ({
      kind: "engine-scenario",
      questionText: q,
      question: "How does Quick-Draw work?",
      premise: {
        turnPlayer: "me",
        units: [],
      },
      actions: [],
      assumptions: [
        "Auto-built rule-demo. [Quick-Draw] is a Reaction-timed permission that lets the controller assign their " +
          "combat damage first; the engine models it via the combat damage step's per-side priority hook (rule 723).",
      ],
    }),
  },
  {
    title: "Tough N — reduce incoming non-combat damage by N",
    match: ["tough"],
    build: (q): Scenario => ({
      kind: "engine-scenario",
      questionText: q,
      question: "How does Tough N work?",
      premise: {
        turnPlayer: "me",
        units: [],
      },
      actions: [],
      assumptions: [
        "Auto-built rule-demo. [Tough N] reduces incoming non-combat damage by N (rule 712); modelled in the " +
          "engine's damage-effect handler via meta.toughness.",
      ],
    }),
  },
  {
    title: "[Deathknell] — fires when the unit is destroyed",
    match: ["deathknell", "death knell"],
    build: (q): Scenario => ({
      kind: "engine-scenario",
      questionText: q,
      question: "When does a [Deathknell] ability trigger?",
      premise: {
        turnPlayer: "me",
        units: [{ id: "u", side: "me", might: 2, name: "Deathknell Unit" }],
        notes:
          "Demo: a 2-Might unit that you control. Kill it. [Deathknell] is a triggered ability that fires when " +
          "the unit is moved to the trash by being destroyed (rule 808-series); the engine emits a 'die' event " +
          "and any [Deathknell] listener on the dying card fires. (If the death is REPLACED — e.g. Zhonya's — the " +
          "unit never reaches the trash, so [Deathknell] does NOT fire, rule 808.1.d.1.)",
      },
      actions: [{ kind: "killUnit", target: "u" }],
      assumptions: ["Auto-built minimal scenario; a plain 2-Might unit destroyed outright."],
    }),
  },
  // -------------------------------------------------------------------------
  // PHASE B batch 6 — new abstract-rules-demo topics covering the trigger
  // shapes that dominate the abstract-rules-theory bucket. Each is a small
  // narrative scenario explaining the rule and how the engine executes it,
  // with a runnable engine assertion where one is concise enough.
  // -------------------------------------------------------------------------
  {
    title: "[Legion] — a trigger that fires only after another card played this turn (rule 812)",
    match: ["legion"],
    build: (q): Scenario => ({
      kind: "engine-scenario",
      questionText: q,
      question: "How does the [Legion] keyword / condition work?",
      premise: {
        turnPlayer: "me",
        units: [],
        notes:
          "Demo: [Legion N] = the ability's trigger only fires when, at trigger-check time, you have played at " +
          "least one OTHER card this turn (`cardsPlayedThisTurn[controller] ≥ 1`; the engine evaluates this via " +
          "`condition: { type: \"legion\" }` on the parsed triggered ability — rule 812 / 555). So the first " +
          "Legion card you play in a turn doesn't satisfy its own gate (the count is incremented BEFORE its " +
          "play-self trigger checks, but Legion explicitly excludes the playing card from its own count, rule " +
          "812.2). The second card you play with a Legion trigger DOES fire — the first play already happened.\n" +
          "If a played card is COUNTERED, Legion still credits the play (the play succeeded; only the spell " +
          "body / unit body is removed — rule 555.3 / FAQ on countered Legion). Hidden→Reveal flips a card but " +
          "does not 'play' it again, so revealing from Hidden does not satisfy Legion (rule 812.3 / cf. p0520).",
      },
      actions: [],
      assumptions: [
        "Auto-built rule-demo; the engine implements Legion via `condition: { type: \"legion\" }` on the parsed " +
          "triggered ability — see riftjudge-cases.test.ts 'Legion when you play me trigger' for the runnable form.",
      ],
    }),
  },
  {
    title: "When-I-attack triggers — fire when a unit becomes an attacker in combat",
    match: [
      "when-i-attack",
      "when i attack",
      "when i'm attacking",
      "when i am attacking",
      "when a friendly unit attacks",
      "when you attack here",
      "whenever i attack",
      "on-attack trigger",
      "attack trigger",
      "attack triggers",
    ],
    build: (q): Scenario => ({
      kind: "engine-scenario",
      questionText: q,
      question: "When does a 'When I attack' / 'When you attack here' triggered ability fire?",
      premise: {
        turnPlayer: "me",
        units: [
          { id: "atk", side: "me", might: 3, name: "Attacker", location: "bf" },
          { id: "def", side: "opp", might: 2, name: "Defender", location: "bf" },
        ],
        battlefields: [{ id: "bf", controller: "opp", contested: true, contestedBy: "me" }],
        notes:
          "Demo: a friendly 3-Might attacker contests a battlefield against a 2-Might defender. When the combat " +
          "is resolved (Combat Damage Step, rule 459.2.b / 461.2.a), the engine dispatches an `attack` event for " +
          "each attacker BEFORE damage. Any card with a parsed `{ trigger: { event: \"attack\", on: \"self\" } }` " +
          "ability (e.g. Fiora's 'when I attack or defend 1-on-1, double my Might this combat', Diana Lunari's " +
          "on-attack proc) fires through the listener registry in turn/APNAP order. The defender symmetrically " +
          "gets a `defend` event. (Pre-combat triggers — rule 322.1 / 459.2 / FAQ 'HOT FEPR' — go on the same " +
          "chain; the turn player resolves first.)",
      },
      actions: [{ kind: "resolveCombat", battlefield: "bf", attacker: "me" }],
      assumptions: [
        "Auto-built minimal scenario; `resolveFullCombat` now dispatches `attack`/`defend` events before damage.",
      ],
    }),
  },
  {
    title: "When-I-defend triggers — fire when a unit becomes a defender in combat",
    match: [
      "when-i-defend",
      "when i defend",
      "when i'm defending",
      "when i am defending",
      "when a friendly unit defends",
      "when you defend here",
      "defend trigger",
      "defend triggers",
    ],
    build: (q): Scenario => ({
      kind: "engine-scenario",
      questionText: q,
      question: "When does a 'When I defend' / 'When you defend here' triggered ability fire?",
      premise: {
        turnPlayer: "me",
        units: [
          { id: "atk", side: "me", might: 2, name: "Attacker", location: "bf" },
          { id: "def", side: "opp", might: 3, name: "Defender", location: "bf" },
        ],
        battlefields: [{ id: "bf", controller: "opp", contested: true, contestedBy: "me" }],
        notes:
          "Demo: a 2-Might attacker contests a battlefield against a 3-Might defender. When combat resolves the " +
          "engine dispatches a `defend` event for each defending unit BEFORE damage (rule 459.2.b / 461.2.a). Any " +
          "card with `{ trigger: { event: \"defend\", on: \"self\" } }` (Fiora's 1-on-1 buff, Overzealous Fan's " +
          "on-defend proc, Forge of the Fluff's on-defend ability) fires through the dispatcher. Both `attack` and " +
          "`defend` triggers go on the SAME chain for this combat — they don't 'happen at different times'; the " +
          "turn player resolves first via APNAP (rule 322.1 / HOT FEPR), then the non-turn player.",
      },
      actions: [{ kind: "resolveCombat", battlefield: "bf", attacker: "me" }],
      assumptions: [
        "Auto-built minimal scenario; both `attack` and `defend` events emit through the dispatcher pre-damage.",
      ],
    }),
  },
  {
    title: "On-conquer triggers — fire when a unit conquers a battlefield",
    match: [
      "on-conquer",
      "when i conquer",
      "when you conquer",
      "when a friendly unit conquers",
      "when conquering",
      "conquer trigger",
      "conquer triggers",
    ],
    build: (q): Scenario => ({
      kind: "engine-scenario",
      questionText: q,
      question: "When does a 'When I conquer' / 'When you conquer (here)' triggered ability fire?",
      premise: {
        turnPlayer: "me",
        units: [
          { id: "atk", side: "me", might: 4, name: "Conqueror", location: "bf" },
          { id: "def", side: "opp", might: 1, name: "Defender", location: "bf" },
        ],
        battlefields: [{ id: "bf", controller: "opp", contested: true, contestedBy: "me" }],
        notes:
          "Demo: a 4-Might attacker vs a 1-Might defender — the attacker wins the combat and conquers the " +
          "battlefield. The engine then dispatches a `conquer` event for the conquering player (rule 461.4 / 630), " +
          "and any card with `{ trigger: { event: \"conquer\", on: \"self\"|\"controller\"|\"controller-here\" } }` " +
          "fires through the dispatcher. The event is emitted whether the conquer happens via combat (this demo), " +
          "via `conquerBattlefield` (walk-on conquer of an uncontested battlefield), or via 461.5.d (defender " +
          "establishes control without combat). Conquer triggers are reactable (rule 322.1) — the opponent has an " +
          "opportunity to respond before the conquer-trigger ability resolves.",
      },
      actions: [{ kind: "resolveCombat", battlefield: "bf", attacker: "me" }],
      assumptions: [
        "Auto-built minimal scenario; the engine dispatches a `conquer` event after the battlefield's controller flips.",
      ],
    }),
  },
  {
    title: "On-play triggers — fire when a card is played (chain-reactable)",
    match: [
      "on-play",
      "when i'm played",
      "when i am played",
      "when this is played",
      "when you play a",
      "when you play another",
      "play trigger",
      "play triggers",
      "when played",
      "when play trigger",
      "when-i-am-played",
    ],
    build: (q): Scenario => ({
      kind: "engine-scenario",
      questionText: q,
      question:
        "When does a 'When I'm played' / 'When you play a [type]' triggered ability fire, and can it be countered?",
      premise: {
        turnPlayer: "me",
        units: [],
        notes:
          "Demo: a play-trigger fires when the play itself happens. The engine dispatches `play-self` (the played " +
          "card's own listener) and `play-card` (every other live card with a 'when you play a …' listener) at " +
          "play time (rule 555 / 724). These triggers go ONTO the chain — they don't resolve immediately — so the " +
          "opponent CAN respond with a Reaction before the triggered ability resolves (rule 322.1). However, the " +
          "fact of the play already happened: countering the spell removes the spell body / unit body, but the " +
          "play-trigger that ALREADY fired keeps its place on the chain — countering the spell doesn't retroactively " +
          "un-fire the trigger that the play caused (cf. p0476 — Diana 'when you play a spell at +2' still gets +2 " +
          "even if the spell is later countered; p0804 / p1367 — Legion still triggers on a countered card). The " +
          "narrow exception: if the played card is REMOVED FROM THE STACK before its own `play-self` trigger " +
          "actually checks its condition — e.g. it never resolves and was the source of the trigger — the engine " +
          "still queued the trigger at play time, so it fires (rule 555.3 / FAQ).",
      },
      actions: [],
      assumptions: [
        "Auto-built rule-demo; runnable form: see the bridge's `playCard` primitive — it dispatches `play-self` and " +
          "`play-card` events through the engine's listener registry.",
      ],
    }),
  },
  {
    title: "Equipment attach — attaching a gear card to a unit (rule 818)",
    match: [
      "on-equip",
      "equipment",
      "equip a unit",
      "equipping",
      "attach to a unit",
      "attaching",
      "gear card",
      "gear attach",
    ],
    build: (q): Scenario => ({
      kind: "engine-scenario",
      questionText: q,
      question: "What happens when you attach a gear / equipment card to a unit?",
      premise: {
        turnPlayer: "me",
        units: [{ id: "u", side: "me", might: 2, name: "Wielder" }],
        notes:
          "Demo: equipment (gear) cards attach to a unit and grant their listed Might / keywords / abilities to " +
          "the wielder (rule 818). The engine tracks the attachment via `meta.equippedWith` on the wielder and " +
          "exposes the gear's static effects through `computeEffectiveMight` (Might bonus), the granted-keywords " +
          "pipeline (Tank / Backline / Shield / etc. from gear), and the listener registry (gear-supplied " +
          "triggered abilities listen for events the same way the wielder's own abilities do). When the wielder " +
          "leaves the board (dies / is recalled / returned to hand) the gear is unattached and goes to its " +
          "owner's trash unless an effect routes it elsewhere (rule 818.4). Playing a gear / equipping it is a " +
          "PLAY (rule 555) — it does NOT itself initiate a chain step beyond the normal play-card chain item " +
          "(p0178: 'does equipping equipment start a chain?' — the play of the gear card is the chain item). " +
          "The bridge models gear-Might via `addBuff` on the wielder.",
      },
      actions: [],
      assumptions: [
        "Auto-built rule-demo; the bridge models gear-supplied Might/keywords via `addBuff` + `grantKeyword` on " +
          "the wielder. A native `attachGear` primitive is a future addition.",
      ],
    }),
  },
  // -------------------------------------------------------------------------
  // PHASE B (this batch) — additional mechanic topics.
  // -------------------------------------------------------------------------
  {
    title: "Legends — persistent in the Legend Zone, fuel XP-gated effects (rule 715)",
    match: ["legend", "legends", "legend zone", "legendary"],
    build: (q): Scenario => ({
      kind: "engine-scenario",
      questionText: q,
      question: "How does a legend card work — where does it live, how is it played, and what does it do?",
      premise: {
        turnPlayer: "me",
        units: [],
        notes:
          "Demo: a legend is a persistent card that lives in its OWNER's Legend Zone (rule 715.1), not in the " +
          "main deck. You pay its energy cost to play it — it enters the Legend Zone from outside the game / " +
          "from the supplemental zone (rule 715.2) — and from there its STATIC and TRIGGERED abilities are live " +
          "as if it were a unit on the board. Legends are also the engine's XP source: many legend abilities " +
          "have [Level N] (rule 720) / [while-level] gating — they only fire / apply once the controller has " +
          "accumulated >= N XP. The engine tracks per-player XP via the `xp` counter and gates ability " +
          "resolution through `evaluateAbilityCondition({type:'while-level'})`. Legends DO NOT have Might and " +
          "cannot themselves attack / defend / hold; they buff your other units, draw cards, or generate " +
          "tokens. When a legend's controller would lose the game, the legend stays in the Legend Zone " +
          "(it isn't destroyed by combat damage, since it's never a unit on a battlefield).",
      },
      actions: [],
      assumptions: [
        "Auto-built rule-demo; the engine models legends as `cardType: 'legend'` cards in the `legendZone` zone, " +
          "with XP tracked on `state.players[pid].xp`. Level-gated triggers go through the shared " +
          "`evaluateAbilityCondition` path so they're checked at both emit time AND resolution time " +
          "(intervening-if rule).",
      ],
    }),
  },
  {
    title: "[Hidden] — play a card face-down; unblockable until revealed (rule 730 / Hidden)",
    match: ["hidden", "[hidden]", "face down", "face-down", "facedown"],
    build: (q): Scenario => ({
      kind: "engine-scenario",
      questionText: q,
      question: "How does the [Hidden] keyword work — playing face-down, revealing, and interaction?",
      premise: {
        turnPlayer: "me",
        units: [],
        notes:
          "Demo: a card with [Hidden] can be played FACE-DOWN to a battlefield (rule 730). While face-down it " +
          "has no printed Might / type / abilities — it is just a face-down card occupying a slot, and an " +
          "opponent cannot target it specifically (no name / type / Might to reference). The controller can " +
          "REVEAL it (a separate action) to flip it face-up; on reveal its 'When you play a card from " +
          "[Hidden], …' triggers fire (the parser emits `play-from-hidden` for these), as does the card's " +
          "own `play-self` once it enters play face-up. Until then it doesn't contribute Might to combat (it's " +
          "treated as 0 Might, like a stunned unit, for damage-assignment purposes). The engine tracks " +
          "hidden-ness via `meta.hidden` on the card and cleans up orphaned hidden cards (a face-down card " +
          "on a battlefield that's gone) during state-based checks (rule 522).",
      },
      actions: [],
      assumptions: [
        "Auto-built rule-demo; the bridge does not yet expose a `playHidden` primitive — the engine moves " +
          "model hidden-ness via `meta.hidden` and the `hide` / `play-from-hidden` event types.",
      ],
    }),
  },
  {
    title: "Token units — created by effects, can't leave play to a zone (rule 712)",
    match: ["token", "tokens", "token unit", "create token", "recruit"],
    build: (q): Scenario => ({
      kind: "engine-scenario",
      questionText: q,
      question: "How do token units work — where do they come from, can they be returned to hand, what happens when they die?",
      premise: {
        turnPlayer: "me",
        units: [],
        notes:
          "Demo: a token is a card representation created by an effect (e.g. 'Play a 1 Might Recruit unit " +
          "token.', 'Play a Gold gear token.'). Tokens are NOT in any deck — they enter play directly from " +
          "outside the game (rule 712.1). The token-creation effect specifies the token's Might / name / " +
          "card type / printed keywords. While in play they ARE units / gear and respond to everything " +
          "normal cards do (combat, triggers, damage). When a token would leave play to ANY zone other than " +
          "the battlefield it was on — trash, hand, deck, hidden, legend zone — it CEASES TO EXIST instead " +
          "(rule 712.3). Practical implications: returning a token to hand removes it from the game, " +
          "recalling a token unit (e.g. via [Ambush] cleanup) removes it, killing a token unit removes it " +
          "and DOES still fire its `die` triggers / Deathknell on the way out (the cessation is the " +
          "replacement for the trash step, but the death is the death). 'When you play a token unit, …' " +
          "triggers (parsed as `play-token-unit`) fire on the token's entrance.",
      },
      actions: [],
      assumptions: [
        "Auto-built rule-demo; the engine creates tokens via the `create-token` effect (parsed shape carries a " +
          "`TokenDefinition`). Cessation-on-leave-play is enforced by the cleanup step — tokens are not added " +
          "to any zone outside the battlefield.",
      ],
    }),
  },
  {
    title: "Equipment attach — alias of [on-equip] for explicit phrasing",
    // Alias so questions phrased as "equipment-attach" route to the same
    // gear-attach demo body as [on-equip] without duplicating it.
    match: ["equipment-attach", "attach equipment"],
    build: (q): Scenario => ({
      kind: "engine-scenario",
      questionText: q,
      question: "What happens when you attach a gear / equipment card to a unit?",
      premise: {
        turnPlayer: "me",
        units: [{ id: "u", side: "me", might: 2, name: "Wielder" }],
        notes:
          "Demo: same as the [on-equip] topic — equipment (gear) cards attach to a unit and grant their listed " +
          "Might / keywords / abilities to the wielder (rule 818). The engine tracks the attachment via " +
          "`meta.equippedWith` on the wielder and exposes the gear's static effects through " +
          "`computeEffectiveMight` (Might bonus), the granted-keywords pipeline, and the listener registry. " +
          "When the wielder leaves the board the gear is unattached and goes to its owner's trash unless an " +
          "effect routes it elsewhere (rule 818.4). Playing a gear IS a play — it goes on the chain as a " +
          "normal play-card chain item (p0178).",
      },
      actions: [],
      assumptions: [
        "Auto-built rule-demo (alias of [on-equip] for explicit 'equipment-attach' queries). Bridge models " +
          "gear-supplied Might/keywords via `addBuff` + `grantKeyword` on the wielder.",
      ],
    }),
  },
  {
    title: "Activated abilities — paying a cost to use an ability (rule 322)",
    match: ["activated-cost", "activated ability", "activated abilities", "activate ability", "pay to activate"],
    build: (q): Scenario => ({
      kind: "engine-scenario",
      questionText: q,
      question: "How do activated abilities work — what's the cost, who can activate, and does it go on the chain?",
      premise: {
        turnPlayer: "me",
        units: [],
        notes:
          "Demo: an ACTIVATED ABILITY is one whose text reads '[Cost]: [Effect]' (rule 322). The cost can be " +
          "energy, an exhaust ([>]), banishing the source, paying XP, discarding a card, or a combination — " +
          "whatever appears before the colon. To activate: the controller PAYS the cost (immediately and " +
          "irrevocably; energy / exhaust / XP / discards happen now), and the ability goes on the chain as " +
          "a new chain item (rule 541). Opponents can respond with Reactions before it resolves; when it " +
          "resolves the [Effect] half runs. Most activated abilities can be used at any time the controller " +
          "has priority (rule 322.2) — including during combat or in response to other chain items. A " +
          "notable subset: [Action] abilities can only be activated on YOUR turn at sorcery speed (no chain " +
          "active); [Reaction] activated abilities can be played any time, even on the opponent's turn. The " +
          "engine models cost-payment through the `cost-system` (energy / exhaust / xp / discard), and the " +
          "chain via `chain-system` — activated abilities and spell plays use the SAME chain-item type so " +
          "the resolution rules apply uniformly.",
      },
      actions: [],
      assumptions: [
        "Auto-built rule-demo; the engine models activated abilities as parsed `{type:'activated', cost, effect}` " +
          "abilities and routes their activation through `payCost` → `pushChainItem` → chain resolution.",
      ],
    }),
  },
  {
    title: "Reaction window — when a Reaction can be played (rule 323)",
    match: ["reaction-window", "reaction", "[reaction]", "reaction speed", "instant speed"],
    build: (q): Scenario => ({
      kind: "engine-scenario",
      questionText: q,
      question: "When can a Reaction be played, and how does it interact with the chain and combat?",
      premise: {
        turnPlayer: "me",
        units: [],
        notes:
          "Demo: a [Reaction] spell / ability can be played AT ANY TIME its controller has priority (rule " +
          "323.1) — including on the opponent's turn, during combat, and in response to a chain item that " +
          "is itself in the process of resolving (well, before it resolves: it's on the chain). Concretely: " +
          "(a) when a chain item is on the chain and it's your turn to act, you may add a Reaction as a new " +
          "chain item — the chain then continues resolving LIFO from the top, so your Reaction resolves " +
          "BEFORE the item it responded to. (b) Outside the chain, both players still hold priority — a " +
          "Reaction can be played in response to any move (a unit attacking, a battlefield being conquered, " +
          "a counter being placed) by opening a new chain step. (c) Reactions can be played even when an " +
          "[Action]-only window is closed (e.g. during combat). The engine surfaces this via the priority " +
          "loop in `chain-system`: after every state-changing move it offers both players a chance to respond, " +
          "and reaction-speed chain items are eligible at every offer.",
      },
      actions: [],
      assumptions: [
        "Auto-built rule-demo; reaction-vs-action timing is enforced by the chain priority loop (`chain-system`) " +
          "and by the keyword filter on chain-item eligibility (Action-only items are gated; Reactions are not).",
      ],
    }),
  },
];

/** Lower-case lookup index: every match-phrase -> its topic. */
const _index: Map<string, RulesDemoTopic> = (() => {
  const m = new Map<string, RulesDemoTopic>();
  for (const t of RULES_DEMO_TOPICS) {
    for (const phrase of t.match) {
      if (!m.has(phrase)) m.set(phrase, t);
    }
  }
  return m;
})();

/** Resolve a topic by its key (the first `match` entry) or any match-phrase. */
export function findDemoTopic(key: string): RulesDemoTopic | undefined {
  return _index.get(key.trim().toLowerCase());
}

/** Topics whose primary key is a bare keyword name — these win detection over
 *  the generic combat/SBA topics when both match (e.g. "Tank in a showdown"). */
const KEYWORD_KEYS = new Set([
  "tank",
  "backline",
  "assault",
  "deathknell",
  "shield",
  "hunt",
  "deflect",
  "ambush",
  "stun",
  "quick-draw",
  "tough",
  // PHASE B batch 6 — new trigger-shape / mechanic topics. These are
  // mechanic-asking-only via their `match` phrases (no combat-context required).
  "legion",
  "when-i-attack",
  "when-i-defend",
  "on-conquer",
  "on-play",
  "on-equip",
  // PHASE B (this batch) — mechanic topics
  "legend",
  "hidden",
  "token",
  "equipment-attach",
  "activated-cost",
  "reaction-window",
]);

/**
 * Heuristic: does this free-text question map to a supported demo topic?
 * Returns the canonical topic key, or undefined. Used by the triage classifier
 * (v3) to credit abstract questions that the rules-demo mode can now answer.
 */
export function detectDemoTopic(questionText: string): string | undefined {
  const q = questionText.toLowerCase();
  const matchPhrase = (phrase: string): boolean => {
    // Word-ish boundary for short keyword names so "tank" doesn't match "tankard".
    const re = new RegExp(`(^|[^a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i");
    return re.test(q);
  };
  // Pass 1: keyword-named topics (most specific). Among these, longest match wins.
  const kwPhrases = [..._index.keys()]
    .filter((p) => KEYWORD_KEYS.has(_index.get(p)!.match[0]))
    .sort((a, b) => b.length - a.length);
  for (const phrase of kwPhrases) {
    if (matchPhrase(phrase)) return _index.get(phrase)!.match[0];
  }
  // Pass 2: everything else, longest phrase first.
  const rest = [..._index.keys()]
    .filter((p) => !KEYWORD_KEYS.has(_index.get(p)!.match[0]))
    .sort((a, b) => b.length - a.length);
  for (const phrase of rest) {
    if (matchPhrase(phrase)) return _index.get(phrase)!.match[0];
  }
  return undefined;
}

/**
 * Expand a `kind: "rules-demo"` Scenario into a concrete `engine-scenario`.
 * Throws if the topic isn't recognised (caller should fall back to Track B).
 */
export function expandRulesDemo(scenario: Scenario): Scenario {
  const key = (scenario as { demoTopic?: string }).demoTopic;
  if (!key) {
    // No explicit topic — try to detect one from the question text.
    const detected = detectDemoTopic(scenario.questionText || scenario.question || "");
    if (!detected) {
      throw new Error(
        "rules-demo Scenario has no `demoTopic` and the question text doesn't match a supported demo topic — route to Track B.",
      );
    }
    const t = findDemoTopic(detected)!;
    const built = t.build(scenario.questionText || scenario.question || "");
    return mergeDemoMeta(scenario, built, t);
  }
  const t = findDemoTopic(key);
  if (!t) {
    throw new Error(`rules-demo: unknown demoTopic "${key}" (known: ${RULES_DEMO_TOPICS.map((x) => x.match[0]).join(", ")}).`);
  }
  const built = t.build(scenario.questionText || scenario.question || "");
  return mergeDemoMeta(scenario, built, t);
}

function mergeDemoMeta(orig: Scenario, built: Scenario, t: RulesDemoTopic): Scenario {
  return {
    ...built,
    questionText: orig.questionText || built.questionText,
    question: orig.question || built.question,
    assumptions: [
      `Auto-built demo scenario for "${t.title}" — the bridge constructed a minimal board demonstrating this rule and ran it through the engine.`,
      ...(orig.assumptions ?? []),
      ...(built.assumptions ?? []),
    ],
  };
}
