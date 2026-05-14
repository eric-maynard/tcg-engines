/**
 * riftjudge-engine-bridge — ALWAYS-ANSWER demo suite
 *
 * A spread of ~8 hand-authored Scenarios covering the full range of RiftJudge
 * question types, demonstrating that every type now yields a coherent
 * answer-with-confidence:
 *
 *   1. engine-scenario — combat math               (Track A, high)
 *   2. engine-scenario — damage-vs-reduced-Might death check (Track A)
 *   3. underspecified  — "does the defender die?" → conditional (variants, Track A)
 *   4. underspecified  — "does my attacker survive an attack?" → conditional
 *   5. rules-question  — conquer-then-play-Rengar timing      (Track B)
 *   6. rules-question  — LIFO chain resolution order          (Track B, high)
 *   7. out-of-engine-scope — Meditation exhaust-cost during a showdown (Track B)
 *   8. out-of-engine-scope — Flash relocating a target out of an effect (Track B)
 *
 * Rule cites reference riftbound-rules/version-2026-03-30/ (see the
 * `riftbound-rules` skill's indexes). They are best-effort, not infallible —
 * which is exactly why each Track-B answer carries a confidence level.
 */

import type { Scenario } from "./scenario-schema";

// --- 1. engine-scenario: combat math ---------------------------------------

export const sCombatMath: Scenario = {
  kind: "engine-scenario",
  questionText:
    "I attack an open battlefield with a 5-Might unit; opponent reacts with Stupefy to drop it to 4. Their lone defender is a 3-Might unit. Who wins the combat, and does my unit survive?",
  question: "Who wins the combat — and does my unit survive?",
  premise: {
    turnPlayer: "me",
    units: [
      { id: "atk", side: "me", might: 5, name: "(my attacker)", location: "bf" },
      { id: "def", side: "opp", might: 3, name: "(their defender)", location: "bf" },
    ],
    battlefields: [{ id: "bf", controller: null }],
    notes:
      "Stupefy (OGN-095) is a real Reaction: -1 Might this turn, min 1. Modeled as its modifyMight effect; the draw rider is cosmetic.",
  },
  actions: [
    {
      kind: "playSpell",
      name: "Stupefy",
      side: "opp",
      effects: [
        { kind: "modifyMight", target: "atk", delta: -1, source: "Stupefy" },
        { kind: "draw", side: "opp", count: 1, source: "Stupefy" },
      ],
    },
    { kind: "resolveCombat", battlefield: "bf", attacker: "me" },
  ],
};

// --- 2. engine-scenario: damage-vs-reduced-Might death check (p0382) -------

export const sDamageReduce: Scenario = {
  kind: "engine-scenario",
  questionText:
    "If a 4-Might unit is hit by Bellows Breath (1 damage) and then targeted by a spell that reduces its Might by 3 or more, does the unit die?",
  question: "does the unit die?",
  premise: {
    turnPlayer: "opp",
    units: [{ id: "u", side: "me", might: 4, name: "(my 4-Might unit)" }],
    notes:
      "Bellows Breath modeled as 1 damage marked. The reduce-Might-by-3+ spell modeled as modifyMight -3. After both: 1 marked damage vs effective Might 1 → lethal per rule 143.2.a.",
  },
  actions: [
    { kind: "addDamage", target: "u", amount: 1, source: "Bellows Breath" },
    { kind: "modifyMight", target: "u", delta: -3, source: "Might-reduction spell" },
  ],
};

// --- 3. underspecified → conditional (p0209) -------------------------------

export const sTwoAttackersConditional: Scenario = {
  kind: "engine-scenario",
  questionText:
    "With two 4-Might units attacking, does the opponent's unit die?",
  question: "does the opponent's lone defender die in the combat?",
  assumptions: [
    "The asker gives no defender Might and no battlefield control, so the answer is conditional on the defender's Might. Two 4-Might attackers assign 8 total Might as damage; any single defender dies iff its Might ≤ 8.",
    "Assumed the opponent has exactly one defender at the contested battlefield and no other modifiers.",
  ],
  variants: [
    {
      label: "their defender has ≤ 8 Might (e.g. a 5-Might unit)",
      scenario: {
        kind: "engine-scenario",
        questionText: "(variant) two 4-Might attackers vs a 5-Might lone defender",
        question: "does the opponent's lone defender die in the combat?",
        premise: {
          turnPlayer: "me",
          units: [
            { id: "a1", side: "me", might: 4, name: "(attacker 1)", location: "bf" },
            { id: "a2", side: "me", might: 4, name: "(attacker 2)", location: "bf" },
            { id: "d", side: "opp", might: 5, name: "(their defender)", location: "bf" },
          ],
          battlefields: [{ id: "bf", controller: "opp" }],
        },
        actions: [{ kind: "resolveCombat", battlefield: "bf", attacker: "me" }],
      },
    },
    {
      label: "their defender has > 8 Might (e.g. a 9-Might unit)",
      scenario: {
        kind: "engine-scenario",
        questionText: "(variant) two 4-Might attackers vs a 9-Might lone defender",
        question: "does the opponent's lone defender die in the combat?",
        premise: {
          turnPlayer: "me",
          units: [
            { id: "a1", side: "me", might: 4, name: "(attacker 1)", location: "bf" },
            { id: "a2", side: "me", might: 4, name: "(attacker 2)", location: "bf" },
            { id: "d", side: "opp", might: 9, name: "(their defender)", location: "bf" },
          ],
          battlefields: [{ id: "bf", controller: "opp" }],
        },
        actions: [{ kind: "resolveCombat", battlefield: "bf", attacker: "me" }],
      },
    },
  ],
};

// --- 4. underspecified → conditional: "does my attacker survive?" ----------

export const sAttackerSurvivesConditional: Scenario = {
  kind: "engine-scenario",
  questionText:
    "If I attack with a unit, does it survive?",
  question: "does my attacking unit survive the combat?",
  assumptions: [
    "Wildly underspecified: no Might given for either side. Modeled as a generic attacker vs a defender; outcome depends on relative Might (a unit survives combat iff the opposing summed Might is below its own Might).",
  ],
  variants: [
    {
      label: "you out-Might the defense (e.g. 6-Might attacker vs lone 3-Might defender)",
      scenario: {
        kind: "engine-scenario",
        questionText: "(variant) 6-Might attacker vs lone 3-Might defender at an open bf",
        question: "does my attacking unit survive the combat?",
        premise: {
          turnPlayer: "me",
          units: [
            { id: "atk", side: "me", might: 6, name: "(my attacker)", location: "bf" },
            { id: "def", side: "opp", might: 3, name: "(their defender)", location: "bf" },
          ],
          battlefields: [{ id: "bf", controller: null }],
        },
        actions: [{ kind: "resolveCombat", battlefield: "bf", attacker: "me" }],
      },
    },
    {
      label: "the defense out-Mights you (e.g. 3-Might attacker vs lone 6-Might defender)",
      scenario: {
        kind: "engine-scenario",
        questionText: "(variant) 3-Might attacker vs lone 6-Might defender at an open bf",
        question: "does my attacking unit survive the combat?",
        premise: {
          turnPlayer: "me",
          units: [
            { id: "atk", side: "me", might: 3, name: "(my attacker)", location: "bf" },
            { id: "def", side: "opp", might: 6, name: "(their defender)", location: "bf" },
          ],
          battlefields: [{ id: "bf", controller: null }],
        },
        actions: [{ kind: "resolveCombat", battlefield: "bf", attacker: "me" }],
      },
    },
  ],
};

// --- 5. rules-question: conquer-then-play-Rengar timing (p0100) ------------

export const sRengarTiming: Scenario = {
  kind: "rules-question",
  questionText: "can I send in a unit to conquer and then play Rengar from my hand?",
  question: "can I use Rengar's 'play me to a battlefield I'm attacking' ability after moving in to contest?",
  whatsUnsupported:
    "card-specific text (Rengar's play-to-attacked-battlefield ability), attacker designation timing, the contest→combat sequence — none of which are in the engine's primitive vocabulary",
  rulesAnswer: {
    verdict:
      "Not yet — you only gain the Attacker designation once combat actually begins, so you can't use a 'play me to a battlefield I'm attacking' ability while you're still just contesting it.",
    reasoning:
      "Moving a unit onto an uncontrolled (or opposing) battlefield applies the Contested status (rule 456 — staged combat) but does NOT make you the Attacker. The Attacker designation is established only at Step 1 of Combat — the Combat Showdown Step (rule 459.2.b.1: \"The Attacker is the player whose unit(s) applied the Contested status … They gain the Attacker designation now\"), which happens later, during a Cleanup with an empty chain (rule 455). So in the window right after your move resolves you are NOT the Attacker, and any ability that keys off 'a battlefield I'm attacking' / 'the Attacker' can't be used. Once the showdown has initiated and you hold the Attacker designation, Rengar's exception would let you play him to that battlefield (and you can always play him to your base or a battlefield you already control at reaction speed, energy permitting).",
    cites: ["456", "455", "459.2.b.1", "459.2.b.3"],
    confidence: "medium",
    assumptions: [
      "Rengar's printed text is the 'as an additional play option, play me to a battlefield where you're the attacker' exception (matches the bot's reading) — the exact card text wasn't pulled from riftbound-cards.",
    ],
  },
};

// --- 6. rules-question: LIFO chain resolution order ------------------------

export const sLifoChain: Scenario = {
  kind: "rules-question",
  questionText:
    "If I play a spell and my opponent responds with a Reaction, which one resolves first?",
  question: "in what order do chained spells resolve?",
  rulesAnswer: {
    verdict: "Your opponent's Reaction resolves first — the chain resolves last-in, first-out (LIFO).",
    reasoning:
      "Each spell played into a Showdown's open state adds an item to the Chain (rule 342.1). The Chain resolves top-down: the most recently added item resolves first, then the next, and so on, until the chain is empty — the standard LIFO behavior the bot cites as Rule 342.1. So: you play your spell (chain item 1); they respond with a Reaction (chain item 2, on top); item 2 resolves, then item 1. Practically this is why a Reaction that lowers a unit's Might 'in response' takes effect before the spell it's responding to.",
    cites: ["342", "342.1", "325 (Chains and Showdowns)"],
    confidence: "high",
  },
};

// --- 7. out-of-engine-scope: Meditation exhaust-cost during a showdown (p0001) ---

export const sMeditationExhaust: Scenario = {
  kind: "out-of-engine-scope",
  questionText:
    "Can I cast Meditation during a showdown as the attacker and exhaust my only attacking unit to draw 2?",
  question: "can Meditation's exhaust-a-unit cost be paid by my sole attacker mid-showdown, and what happens to it?",
  whatsUnsupported:
    "Reaction-speed plays inside a showdown, paying an 'exhaust a friendly unit' additional cost, exhaust state, and showdown persistence — none of which the engine's primitive vocab (Might mods / damage / kill / combat) can express",
  // We still record a board for context: one attacking unit of yours.
  premise: {
    turnPlayer: "me",
    units: [{ id: "myAtk", side: "me", might: 3, name: "(my only attacking unit)", location: "bf" }],
    battlefields: [{ id: "bf", controller: "opp", contested: true, contestedBy: "me" }],
    notes: "Board kept only for context — the question is about cost-payment + showdown timing, which the engine doesn't model.",
  },
  rulesAnswer: {
    verdict:
      "Yes — Meditation is a Reaction, so you can play it in either showdown state, choose to pay the 'exhaust a friendly unit' additional cost on your attacking unit, and it stays in combat (just exhausted) while you draw 2.",
    reasoning:
      "Meditation is a [Reaction] spell, so it's legal during a showdown in both the open and closed (chain present) states. Its additional cost is 'exhaust a friendly unit' — as the attacker you control that unit, so it's a legal choice. Paying the cost exhausts the unit but does NOT remove it from the battlefield or strip its Attacker designation: a showdown doesn't end because a unit becomes exhausted (or even dies) — it continues until all players pass focus. So the unit keeps participating; it just can't be exhausted again, and any ability it has that requires being ready won't trigger afterward. Because Meditation is a Reaction it goes on the chain and, LIFO, resolves before the showdown continues (rule 342.1), at which point you draw 2.",
    cites: ["342.1", "459.2.b.3 (Attacker designation)", "325 (Showdowns / focus)"],
    confidence: "medium",
    assumptions: [
      "Meditation's text is '[Reaction] spell; additional cost: exhaust a friendly unit; effect: draw 2' (matches the bot's reading and FAQ #9927) — exact card text not pulled from riftbound-cards.",
      "'Showdown persists through exhaustion/death' is taken from the bot's cited FAQ #8012; the comprehensive rules say a showdown closes when all players pass focus.",
    ],
  },
};

// --- 8. out-of-engine-scope: Flash relocating a target out of an effect (p0010) ---

export const sFlashSavesUnit: Scenario = {
  kind: "out-of-engine-scope",
  questionText:
    "Does Flash save units from dying to Elder Dragon's effect / Bellows Breath?",
  question: "can moving a targeted unit with Flash dodge a 'damage units at this battlefield' effect?",
  whatsUnsupported:
    "unit movement / relocation (Flash), location-restricted targeting ('units at this battlefield'), and targeting-relationship re-checks at resolution — the engine has no movement primitive",
  rulesAnswer: {
    verdict:
      "Yes — if you Flash the targeted units to your base in response, then when Bellows Breath / Elder Dragon's ability resolves they're no longer at the location the effect specified, so they don't take the damage.",
    reasoning:
      "Both Bellows Breath ('choose up to 3 units at the same location') and Elder Dragon's play ability ('an enemy unit at each location') lock onto units at a specific battlefield. Flash is a Reaction that moves friendly units to your base, so you can play it after the spell/ability is announced but before it resolves. On resolution the effect re-checks its targets against its location requirement; units that are now in your base no longer satisfy 'at this battlefield', so the effect simply doesn't apply to them (it 'misses' them — like mistargeting, rule 355.6). Since no damage is dealt, Elder Dragon's passive ('any damage is lethal') never gets a chance to apply to those units either. (If instead a unit were moved to a non-board zone like hand/deck, the targeting relationship is severed entirely.)",
    cites: ["355.6 (mistargeting)", "440 (movement)", "800 keyword: Reaction timing"],
    confidence: "medium",
    assumptions: [
      "Flash's text is 'move one or more friendly units to your base' at Reaction speed — exact card text not pulled from riftbound-cards.",
      "Bellows Breath / Elder Dragon target wording taken from the bot's description ('units at the same location' / 'an enemy unit at each location').",
    ],
  },
};

export const demoSuite: Scenario[] = [
  sCombatMath,
  sDamageReduce,
  sTwoAttackersConditional,
  sAttackerSurvivesConditional,
  sRengarTiming,
  sLifoChain,
  sMeditationExhaust,
  sFlashSavesUnit,
];
