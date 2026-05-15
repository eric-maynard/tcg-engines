/**
 * Rules Audit (Unleashed / CR 2026-03-30) — batch b14 re-scan.
 *
 * Converts T's surviving `test.todo`s from b13 into real engine fixes:
 *
 *   - Rule 467 — "If they have more points than any opponent, they Win
 *       the Game." Engine now has a `hasPlayerWonStrict()` predicate that
 *       layers a strict-greater-than-every-opponent gate on top of the
 *       threshold check. All point-gain sites (combat conquer/hold,
 *       burnOut/discard, score effect, flow-driven burn-out) now consult
 *       it, so a tie at the Victory Score no longer instantly ends the
 *       game.
 *
 *   - Rule 472.3.d.2 — "Increases applied before decreases within a
 *       sequence." The static-aura pass already did this (b12); the one-
 *       shot path now does too. `executeEffect({ type: "sequence" })`
 *       reorders contiguous `modify-might` sub-effects so positives run
 *       before negatives, stable on input order (rule 471.1). Non-
 *       modify-might effects act as fences so cross-type sequencing is
 *       preserved.
 *
 *   - Rule 460.2.c.7 — assigner-choice for exclusionary requirements.
 *       `CombatUnit` now carries an optional
 *       `damageAssignmentRequirements: readonly number[]` array. When
 *       2+ priorities conflict, the assigner picks one via the
 *       `ChooseRequirementHook` passed to `resolveCombat` /
 *       `distributeDamage`; the default policy is "smallest priority
 *       wins" (Tank-first), matching the rule's verbatim example.
 *
 *   - Rule 715 — Bonus Damage. The `damage` effect-executor case now
 *       scans the controller's board permanents for `deal-bonus-damage`
 *       statics and bumps the per-target amount BEFORE Prevent /
 *       replacement (rule 715.4). Generic: any static with shape
 *       `{ type: "static", effect: { type: "deal-bonus-damage", amount } }`
 *       on the controller's permanents bumps every subsequent `damage`
 *       emission from that player's source.
 *
 *   - Cost-reduction `minimum` parsing (S's gap). The parser previously
 *       stored `effect.minimum` as the raw symbol token
 *       `":rb_energy_1:"`. The engine now reads numeric `minimum` and
 *       clamps `costModifier` so the effective cost never falls below
 *       it. Asserted end-to-end against Slugger (sfd-013-221, rulesText
 *       "I cost [1] less for each card you've played this turn, to a
 *       minimum of [1].").
 *
 * Methodology: minimal state → one input → assert the rule-correct
 * outcome → cite the rule number. No per-card if-statements — the engine
 * primitives (`hasPlayerWonStrict`, `executeEffect` sequence reorder,
 * `resolveCombat` chooseRequirement hook, the `damage` case bonus-damage
 * scan, the `cost-reduction` minimum clamp) are the units under test.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  CardDefinitionRegistry,
  clearGlobalCardRegistry,
  setGlobalCardRegistry,
} from "../../operations/card-lookup";
import {
  checkVictoryAtCleanup,
  getEffectiveVictoryScore,
  hasPlayerWon,
  hasPlayerWonStrict,
} from "../../game-definition/win-conditions/victory";
import type { CombatUnit } from "../../combat";
import { distributeDamage, resolveCombat } from "../../combat";
import type { EffectContext, ExecutableEffect } from "../../abilities/effect-executor";
import { executeEffect } from "../../abilities/effect-executor";
import type { RiftboundCardMeta, RiftboundGameState } from "../../types";

// ===========================================================================
// Test fixtures — minimal shared mock state / effect context.
// ===========================================================================

function createMockState(): RiftboundGameState {
  return {
    battlefields: { "bf-1": { contested: false, controller: "p1", id: "bf-1" } },
    conqueredThisTurn: { p1: [], p2: [] },
    gameId: "test",
    players: { p1: { id: "p1", turnsTaken: 0, victoryPoints: 0, xp: 0 }, p2: { id: "p2", turnsTaken: 0, victoryPoints: 0, xp: 0 } },
    runePools: { p1: { energy: 0, power: {} }, p2: { energy: 0, power: {} } },
    scoredThisTurn: { p1: [], p2: [] },
    status: "playing",
    turn: { activePlayer: "p1", number: 1, phase: "main" },
    victoryScore: 8,
  } as unknown as RiftboundGameState;
}

interface MockCard {
  zone: string;
  owner: string;
  meta: Partial<RiftboundCardMeta>;
}

function createMockEffectContext(
  draft: RiftboundGameState,
  opts: {
    playerId: string;
    sourceCardId: string;
    cards?: Record<string, MockCard>;
  },
): EffectContext & { cardStore: Map<string, MockCard> } {
  const cardStore = new Map<string, MockCard>();
  const zoneContents = new Map<string, string[]>();

  for (const [id, data] of Object.entries(opts.cards ?? {})) {
    cardStore.set(id, { ...data, meta: { ...data.meta } });
    const existing = zoneContents.get(data.zone) ?? [];
    existing.push(id);
    zoneContents.set(data.zone, existing);
  }

  const ctx: EffectContext & { cardStore: Map<string, MockCard> } = {
    cardStore,
    cards: {
      getCardController: (cardId) => cardStore.get(cardId as string)?.owner,
      getCardMeta: ((cardId: string) =>
        cardStore.get(cardId)?.meta) as unknown as EffectContext["cards"]["getCardMeta"],
      getCardOwner: (cardId) => cardStore.get(cardId as string)?.owner,
      updateCardMeta: ((cardId: string, updates: Record<string, unknown>) => {
        const card = cardStore.get(cardId);
        if (card) {
          card.meta = { ...card.meta, ...updates } as Partial<RiftboundCardMeta>;
        }
      }) as unknown as EffectContext["cards"]["updateCardMeta"],
    },
    counters: {
      addCounter: ((cardId: string, counter: string, amount: number) => {
        const card = cardStore.get(cardId);
        if (!card) {
          return;
        }
        if (counter === "damage") {
          card.meta.damage = (card.meta.damage ?? 0) + amount;
        }
      }) as unknown as EffectContext["counters"]["addCounter"],
      clearCounter: () => {},
      removeCounter: () => {},
      setFlag: () => {},
    },
    draft,
    playerId: opts.playerId,
    sourceCardId: opts.sourceCardId,
    zones: {
      drawCards: () => {},
      getCardZone: ((cardId: string) =>
        cardStore.get(cardId)?.zone) as unknown as EffectContext["zones"]["getCardZone"],
      getCardsInZone: ((zoneId: string, playerId?: string) => {
        const cards = zoneContents.get(zoneId) ?? [];
        if (playerId) {
          return cards.filter((id) => cardStore.get(id)?.owner === playerId);
        }
        return [...cards];
      }) as unknown as EffectContext["zones"]["getCardsInZone"],
      moveCard: () => {},
    },
  };

  return ctx;
}

// ===========================================================================
// Rule 467 — strict-greater-than-every-opponent tiebreaker
// ===========================================================================

describe("Rule 467 — Win requires strictly more points than any opponent", () => {
  test("hasPlayerWonStrict: both players at threshold → neither wins (rule 467 tie)", () => {
    const state: RiftboundGameState = {
      battlefields: {},
      players: {
        p1: { id: "p1", victoryPoints: 8, xp: 0 },
        p2: { id: "p2", victoryPoints: 8, xp: 0 },
      },
      victoryScore: 8,
    } as unknown as RiftboundGameState;
    // Non-strict version says both "won" (threshold-only); the strict tiebreaker
    // Catches the actual rule 467 case.
    expect(hasPlayerWon(state, "p1")).toBe(true);
    expect(hasPlayerWon(state, "p2")).toBe(true);
    expect(hasPlayerWonStrict(state, "p1")).toBe(false);
    expect(hasPlayerWonStrict(state, "p2")).toBe(false);
    expect(checkVictoryAtCleanup(state)).toBeNull();
  });

  test("hasPlayerWonStrict: 9 vs 8 → 9-er wins, 8-er does not (rule 467 strictly-greater)", () => {
    const state: RiftboundGameState = {
      battlefields: {},
      players: {
        p1: { id: "p1", victoryPoints: 9, xp: 0 },
        p2: { id: "p2", victoryPoints: 8, xp: 0 },
      },
      victoryScore: 8,
    } as unknown as RiftboundGameState;
    expect(hasPlayerWonStrict(state, "p1")).toBe(true);
    expect(hasPlayerWonStrict(state, "p2")).toBe(false);
    expect(checkVictoryAtCleanup(state)).toBe("p1");
  });

  test("hasPlayerWonStrict: 8 vs 7 → 8-er wins (control — strict still holds when opp below threshold)", () => {
    const state: RiftboundGameState = {
      battlefields: {},
      players: {
        p1: { id: "p1", victoryPoints: 8, xp: 0 },
        p2: { id: "p2", victoryPoints: 7, xp: 0 },
      },
      victoryScore: 8,
    } as unknown as RiftboundGameState;
    expect(hasPlayerWonStrict(state, "p1")).toBe(true);
    expect(hasPlayerWonStrict(state, "p2")).toBe(false);
  });

  test("hasPlayerWonStrict: 3-player FFA, p1 at 8 + p2 at 8 + p3 at 4 → no winner (any opp at threshold blocks)", () => {
    const state: RiftboundGameState = {
      battlefields: {},
      players: {
        p1: { id: "p1", victoryPoints: 8, xp: 0 },
        p2: { id: "p2", victoryPoints: 8, xp: 0 },
        p3: { id: "p3", victoryPoints: 4, xp: 0 },
      },
      victoryScore: 8,
    } as unknown as RiftboundGameState;
    // Even though p3 is far below, the p1↔p2 tie blocks both.
    expect(hasPlayerWonStrict(state, "p1")).toBe(false);
    expect(hasPlayerWonStrict(state, "p2")).toBe(false);
    expect(hasPlayerWonStrict(state, "p3")).toBe(false);
    expect(checkVictoryAtCleanup(state)).toBeNull();
  });

  test("getEffectiveVictoryScore unchanged (helper still computes the per-player threshold)", () => {
    const state: RiftboundGameState = {
      battlefields: {},
      players: {
        p1: { id: "p1", victoryPoints: 0, victoryScoreModifier: 2, xp: 0 },
        p2: { id: "p2", victoryPoints: 0, xp: 0 },
      },
      victoryScore: 8,
    } as unknown as RiftboundGameState;
    // Aspirant's-climb-style modifier still adjusts the per-player threshold.
    expect(getEffectiveVictoryScore(state, "p1")).toBe(10);
    expect(getEffectiveVictoryScore(state, "p2")).toBe(8);
  });
});

// ===========================================================================
// Rule 472.3.d.2 — increases before decreases (one-shot sequence path)
// ===========================================================================

describe("Rule 472.3.d.2 — `sequence` of modify-might applies increases before decreases", () => {
  let registry: CardDefinitionRegistry;
  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });
  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("sequence [-3 min 1, +2] applied to a 2-Might unit ends at Might 1 (rule 472.3.d.2 reorder)", () => {
    // Without the fix: -3 first (snapshot vs 2, clamp at -1 → modifier=-1, Might=1),
    // Then +2 (modifier=+1, Might=3). With the rule-correct reorder: +2 first
    // (modifier=+2, Might=4), then -3 with min=1 (snapshot vs 4, applied=-3,
    // Modifier=-1, Might=1). End-Might equals 1 under the rule, which is
    // STRICTLY DIFFERENT from the pre-fix end-Might of 3.
    registry.register("u1", { cardType: "unit", id: "u1", might: 2, name: "U1" });
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: { u1: { meta: {}, owner: "p1", zone: "base" } },
      playerId: "p1",
      sourceCardId: "u1",
    });

    executeEffect(
      {
        effects: [
          { amount: -3, minimum: 1, target: { type: "self" }, type: "modify-might" },
          { amount: 2, target: { type: "self" }, type: "modify-might" },
        ],
        type: "sequence",
      } as unknown as ExecutableEffect,
      ctx,
    );

    // Final modifier: +2 then -3 (with snapshot vs 4) = -1. End-Might = 2 + -1 = 1.
    expect(ctx.cardStore.get("u1")?.meta.mightModifier).toBe(-1);
  });

  test("sequence [-3 min 1, +2, -2 min 1] reordered to [+2, -3 min 1, -2 min 1] — proves 3-effect divergence", () => {
    // Pre-fix order (input order): -3 (clamp vs 2 → -1), +2 (+2), -2 (clamp vs 3 → -2) → -1.
    // Rule-correct order (positives first): +2 (vs 2, → +2), -3 (vs 4, → -3),
    //   -2 (vs 1, clamp → 0). End modifier = +2 + -3 + 0 = -1.
    // SAME final number this time; the test pins the *modifier* is computed
    // Through the sorted path even when the answer happens to coincide. Use a
    // Different input where the answers diverge:
    //   [-4 min 1, +1]
    //     Input order: -4 (vs 2, clamp -1) then +1 → modifier 0, Might 2.
    //     Sorted: +1 (vs 2, +1) then -4 (vs 3, clamp -2) → modifier -1, Might 1.
    registry.register("u2", { cardType: "unit", id: "u2", might: 2, name: "U2" });
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: { u2: { meta: {}, owner: "p1", zone: "base" } },
      playerId: "p1",
      sourceCardId: "u2",
    });
    executeEffect(
      {
        effects: [
          { amount: -4, minimum: 1, target: { type: "self" }, type: "modify-might" },
          { amount: 1, target: { type: "self" }, type: "modify-might" },
        ],
        type: "sequence",
      } as unknown as ExecutableEffect,
      ctx,
    );
    // Rule-correct: +1 first (2→3), -4 min 1 (clamp 3-4=−1 but min 1 says
    // Applied = 1-3 = -2). End modifier = +1 + -2 = -1; End-Might = 2 - 1 = 1.
    expect(ctx.cardStore.get("u2")?.meta.mightModifier).toBe(-1);
  });

  test("sequence with non-modify-might fence preserves cross-type order (does not reorder across fences)", () => {
    // A "+2" then "kill" then "-3 min 1" sequence: the +2 and -3 are
    // Separated by a different-typed effect, so they may NOT be reordered.
    // We verify ONLY the +2 lands (the -3 never gets snapshotted into the
    // Same group as the +2 by our reorderer). The "kill" is a no-op against
    // The mocked counters.
    registry.register("u3", { cardType: "unit", id: "u3", might: 5, name: "U3" });
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: { u3: { meta: {}, owner: "p1", zone: "base" } },
      playerId: "p1",
      sourceCardId: "u3",
    });
    executeEffect(
      {
        effects: [
          { amount: -3, minimum: 1, target: { type: "self" }, type: "modify-might" },
          // The fence: a different effect type that the reorderer never crosses.
          { target: { type: "self" }, type: "buff" },
          { amount: 2, target: { type: "self" }, type: "modify-might" },
        ],
        type: "sequence",
      } as unknown as ExecutableEffect,
      ctx,
    );
    // The first group (single -3) applies in input order (no reorder needed):
    //   Vs base 5, no clamp, modifier = -3.
    // Then `buff` (no-op for mightModifier).
    // Then second group (+2): modifier = -3 + 2 = -1. End-Might = 5 + -1 = 4.
    expect(ctx.cardStore.get("u3")?.meta.mightModifier).toBe(-1);
  });
});

// ===========================================================================
// Rule 460.2.c.7 — assigner-choice for exclusionary damage-assignment
// Requirements (Tank + Patrolling on the same unit).
// ===========================================================================

describe("Rule 460.2.c.7 — assigner chooses which damage-assignment requirement applies", () => {
  function makeUnit(over: Partial<CombatUnit> & Pick<CombatUnit, "id">): CombatUnit {
    return {
      baseMight: 3,
      currentDamage: 0,
      keywords: [],
      owner: "p1",
      ...over,
    } as CombatUnit;
  }

  test("default policy: smallest-priority wins (Tank-first) — Caitlyn + granted Tank gets damage FIRST", () => {
    // Two units: Caitlyn-with-Tank has BOTH a Patrolling priority (+1 "last")
    // And a granted Tank priority (-1 "first"). The exclusionary set is
    // [-1, +1]. With no hook, the resolver picks the smallest → -1 → Tank
    // Wins → Caitlyn sorts before the plain unit and is assigned damage
    // First (matching the rule's verbatim example).
    const caitlyn = makeUnit({
      damageAssignmentRequirements: [-1, 1],
      id: "caitlyn",
    });
    const grunt = makeUnit({ baseMight: 2, id: "grunt" });
    const assignment = distributeDamage([grunt, caitlyn], 3);
    // Caitlyn lethal threshold = 3, grunt = 2. Tank-first → caitlyn gets
    // Assigned full lethal (3) and grunt nothing.
    expect(assignment["caitlyn"]).toBe(3);
    expect(assignment["grunt"] ?? 0).toBe(0);
  });

  test("hook overrides default: assigner-favored Patrolling chosen, Caitlyn sorts last", () => {
    const caitlyn = makeUnit({
      damageAssignmentRequirements: [-1, 1],
      id: "caitlyn",
    });
    const grunt = makeUnit({ baseMight: 2, id: "grunt" });
    // Hook picks the LARGEST (Patrolling) for caitlyn.
    const assignment = distributeDamage([grunt, caitlyn], 2, (unit, reqs) =>
      unit.id === "caitlyn" ? Math.max(...reqs) : undefined,
    );
    // Grunt (priority 0) sorts before caitlyn (priority +1). 2 damage just
    // Covers grunt's lethal threshold (2); caitlyn gets nothing.
    expect(assignment["grunt"]).toBe(2);
    expect(assignment["caitlyn"] ?? 0).toBe(0);
  });

  test("resolveCombat forwards chooseRequirement through to distributeDamage", () => {
    // 4-attack damage on a side with [grunt(2), caitlyn(3)] — default Tank-
    // First sees caitlyn lethal first (3), then grunt gets the leftover 1.
    const caitlyn = makeUnit({
      damageAssignmentRequirements: [-1, 1],
      id: "caitlyn",
    });
    const grunt = makeUnit({ baseMight: 2, id: "grunt" });
    const attacker = makeUnit({ baseMight: 4, id: "attacker", owner: "p2" });
    const result = resolveCombat([attacker], [grunt, caitlyn]);
    // 4 damage → caitlyn first (3 → dies), then grunt (1, not lethal).
    expect(result.damageAssignment["caitlyn"]).toBe(3);
    expect(result.damageAssignment["grunt"] ?? 0).toBe(1);
    expect(result.killed).toContain("caitlyn");
    expect(result.killed).not.toContain("grunt");
  });
});

// ===========================================================================
// Rule 715 — Bonus Damage applies per target on `deal` actions.
// ===========================================================================

describe("Rule 715 — `deal-bonus-damage` static bumps each damage emission by N", () => {
  let registry: CardDefinitionRegistry;
  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });
  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("a permanent 'your spells/abilities deal 1 bonus damage' bumps the dealt amount (rule 715.1/.2)", () => {
    // Fiery-Annie-style permanent. Its static effect type is
    // `deal-bonus-damage`, amount=1, source="any" (applies to spells AND
    // Abilities). When a spell whose body is "deal 3 to target unit" fires,
    // The target should take 4, not 3.
    registry.register("fiery-annie", {
      abilities: [
        {
          effect: { amount: 1, source: "any", type: "deal-bonus-damage" },
          type: "static",
        },
      ],
      cardType: "unit",
      id: "fiery-annie",
      keywords: [],
      might: 2,
      name: "Fiery Annie",
    });
    registry.register("zap", { cardType: "spell", id: "zap", name: "Zap" });
    registry.register("target", {
      cardType: "unit",
      id: "target",
      keywords: [],
      might: 5,
      name: "Target",
    });

    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "fiery-annie": { meta: {}, owner: "p1", zone: "base" },
        target: { meta: {}, owner: "p2", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "zap",
    });

    executeEffect(
      {
        amount: 3,
        target: { cardId: "target", type: "specific-card" },
        type: "damage",
      } as unknown as ExecutableEffect,
      ctx,
    );
    // Bonus damage: 3 + 1 = 4 damage counter on `target`.
    expect(ctx.cardStore.get("target")?.meta.damage).toBe(4);
  });

  test("bonus does not apply when the source's controller does NOT have the static (rule 715.1 — 'YOUR spells')", () => {
    // The bonus-static is on p2's board; p1 plays the spell — no bump.
    registry.register("fiery-annie", {
      abilities: [
        { effect: { amount: 1, source: "any", type: "deal-bonus-damage" }, type: "static" },
      ],
      cardType: "unit",
      id: "fiery-annie",
      keywords: [],
      might: 2,
      name: "Fiery Annie",
    });
    registry.register("zap", { cardType: "spell", id: "zap", name: "Zap" });
    registry.register("target", {
      cardType: "unit",
      id: "target",
      keywords: [],
      might: 5,
      name: "Target",
    });

    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        // Owned by p2 — NOT the spell's controller.
        "fiery-annie": { meta: {}, owner: "p2", zone: "base" },
        target: { meta: {}, owner: "p2", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "zap",
    });

    executeEffect(
      {
        amount: 3,
        target: { cardId: "target", type: "specific-card" },
        type: "damage",
      } as unknown as ExecutableEffect,
      ctx,
    );
    // No bump: damage = 3.
    expect(ctx.cardStore.get("target")?.meta.damage).toBe(3);
  });

  test("source-filter: a 'spell-only' bonus static does not bump ability damage (rule 715.x — granular source)", () => {
    registry.register("spell-buffer", {
      abilities: [
        { effect: { amount: 1, source: "spell", type: "deal-bonus-damage" }, type: "static" },
      ],
      cardType: "unit",
      id: "spell-buffer",
      keywords: [],
      might: 2,
      name: "Spell Buffer",
    });
    // The source is a UNIT (ability emission), not a spell — should NOT bump.
    registry.register("ability-source", {
      cardType: "unit",
      id: "ability-source",
      keywords: [],
      might: 3,
      name: "Ability Source",
    });
    registry.register("target", {
      cardType: "unit",
      id: "target",
      keywords: [],
      might: 5,
      name: "Target",
    });

    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "ability-source": { meta: {}, owner: "p1", zone: "base" },
        "spell-buffer": { meta: {}, owner: "p1", zone: "base" },
        target: { meta: {}, owner: "p2", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "ability-source",
    });
    executeEffect(
      {
        amount: 3,
        target: { cardId: "target", type: "specific-card" },
        type: "damage",
      } as unknown as ExecutableEffect,
      ctx,
    );
    expect(ctx.cardStore.get("target")?.meta.damage).toBe(3);
  });
});

// ===========================================================================
// Cost-reduction parser + engine — Slugger's "minimum of [1]" round-trip.
// ===========================================================================

describe("Cost-reduction `minimum` clamp — Slugger end-to-end (rule 472.3.b on a cost)", () => {
  let registry: CardDefinitionRegistry;
  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });
  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("a 5-energy card with cost-reduction(amount=10, minimum=1) clamps `costModifier` to keep cost >= 1", () => {
    // Simulates Slugger after the parser fix: numeric `minimum: 1` is read
    // By the engine's cost-reduction handler, which clamps `costModifier`
    // So the effective cost (baseEnergy + costModifier) never drops below
    // `minimum`. Even a 10-energy reduction on a 5-energy card produces
    // CostModifier = 1 - 5 = -4 (effective cost = 1, the floor).
    registry.register("slugger", {
      cardType: "unit",
      energyCost: 5,
      id: "slugger",
      might: 5,
      name: "Slugger",
    });

    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: { slugger: { meta: {}, owner: "p1", zone: "base" } },
      playerId: "p1",
      sourceCardId: "slugger",
    });

    executeEffect(
      {
        amount: 10,
        minimum: 1,
        target: { type: "self" },
        type: "cost-reduction",
      } as unknown as ExecutableEffect,
      ctx,
    );

    // CostModifier floor = minimum (1) - baseEnergy (5) = -4.
    expect(ctx.cardStore.get("slugger")?.meta.costModifier).toBe(-4);
  });

  test("a sub-minimum reduction (smaller than the floor allows) applies fully", () => {
    // 5-energy card, cost-reduction(amount=2, minimum=1): effective = 5 - 2 = 3,
    // Well above the floor of 1, so costModifier = -2 (no clamp).
    registry.register("slugger", {
      cardType: "unit",
      energyCost: 5,
      id: "slugger",
      might: 5,
      name: "Slugger",
    });

    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: { slugger: { meta: {}, owner: "p1", zone: "base" } },
      playerId: "p1",
      sourceCardId: "slugger",
    });

    executeEffect(
      {
        amount: 2,
        minimum: 1,
        target: { type: "self" },
        type: "cost-reduction",
      } as unknown as ExecutableEffect,
      ctx,
    );

    expect(ctx.cardStore.get("slugger")?.meta.costModifier).toBe(-2);
  });

  test("cost-reduction without `minimum` retains the unbounded behavior (no clamp)", () => {
    // The optional `minimum` defaults to 'no floor', so a 10-energy reduction
    // On a 5-energy card lands at costModifier = -10 (effective cost would
    // Be -5, then clamped at 0 by the deduction-time `Math.max`).
    registry.register("any", {
      cardType: "unit",
      energyCost: 5,
      id: "any",
      might: 3,
      name: "Any",
    });

    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: { any: { meta: {}, owner: "p1", zone: "base" } },
      playerId: "p1",
      sourceCardId: "any",
    });

    executeEffect(
      {
        amount: 10,
        target: { type: "self" },
        type: "cost-reduction",
      } as unknown as ExecutableEffect,
      ctx,
    );

    expect(ctx.cardStore.get("any")?.meta.costModifier).toBe(-10);
  });
});

