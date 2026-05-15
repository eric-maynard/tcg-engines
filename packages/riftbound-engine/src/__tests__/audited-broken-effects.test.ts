/**
 * Regression tests for two cards previously flagged by
 * `card-effect-audit.ts` as "wrapper produced no side-effects":
 *
 *   - Flurry of Feathers (unl-044-219) — `[Reaction] Choose one — Counter a
 *     spell. Play four 1 [Might] Bird unit tokens with [Deflect].`
 *
 *   - Alpha Strike (unl-192-219) — `[Action] Choose a friendly unit. It
 *     deals damage equal to its Might split among enemy units at
 *     battlefields. Then for each unit this kills, do this: Gain 1 XP.`
 *
 * Root causes & fixes covered here:
 *
 *   1. `resolveAmount` only understood `{ might: "self" }` — when the
 *      parser emits `{ might: <TargetDescriptor> }` (Alpha Strike's "deals
 *      damage equal to its Might" where "it" is the chosen friendly
 *      unit), the resolver fell through to 0 and the damage handler
 *      added no counters. Fix: when `might` is a TargetDescriptor, the
 *      resolver resolves the target and uses the first match's effective
 *      Might.
 *
 *   2. The `damage` handler ignored the parser-emitted `split: true`
 *      flag — Alpha Strike's "split among enemy units" was treated as
 *      "deal that much to each", which is incorrect in real play. Fix:
 *      when `split: true`, the engine partitions the total damage across
 *      the resolved targets evenly with remainder front-loaded.
 *
 *   3. The `choice` effect handler used to auto-resolve to the first
 *      option, which silently no-op'd when the head option had no
 *      executable target (Flurry's `counter` with an empty chain). The
 *      handler now writes a `pick-mode` pendingChoice and pauses play
 *      so the caster (or, in goldfish runs, the harness) picks an option
 *      via `resolvePendingChoice`. The pick-mode wiring is implemented
 *      elsewhere in the engine; these tests pin the contract that
 *      `executeEffect` on a `choice` produces an observable state change
 *      (a pendingChoice) for both Flurry-style modal spells.
 */

import { describe, expect, it } from "bun:test";
import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../abilities/effect-executor";
import { executeEffect } from "../abilities/effect-executor";
import { getGlobalCardRegistry } from "../operations/card-lookup";

// ---------------------------------------------------------------------------
// Shared test scaffolding — a minimal `EffectContext` with enough zone /
// Card / counter wiring to satisfy both cards' resolvers.
// ---------------------------------------------------------------------------

const PLAYER = "p1";
const OPP = "p2";

interface Recorded {
  moves: { cardId: string; targetZoneId: string }[];
  createCalls: { cardId: string; zoneId: string; ownerId: string }[];
  counterAdds: { cardId: string; counter: string; amount: number }[];
}

function buildCtx(args: {
  sourceCardId: string;
  /** Additional enemy units on battlefield-bf-1 (default: 0). */
  enemiesAtBattlefield?: number;
  /** Override the friendly unit's printed Might (default: 4). */
  friendlyMight?: number;
}): { ctx: EffectContext; rec: Recorded } {
  const { sourceCardId, enemiesAtBattlefield = 0, friendlyMight = 4 } = args;

  const zoneOf = new Map<string, string>();
  const zoneCards = new Map<string, string[]>();
  const ownerOf = new Map<string, string>();
  const meta = new Map<string, Record<string, unknown>>();
  const rec: Recorded = { counterAdds: [], createCalls: [], moves: [] };

  const registry = getGlobalCardRegistry();
  const place = (id: string, zone: string, owner: string, def: Record<string, unknown>): void => {
    zoneOf.set(id, zone);
    const arr = zoneCards.get(zone) ?? [];
    arr.push(id);
    zoneCards.set(zone, arr);
    ownerOf.set(id, owner);
    registry.register(id, def);
  };

  // Source spell. Spells have no Might (the `might: 0` here means it
  // Will never satisfy a `type: "unit"` target filter), keeping the source
  // Distinct from any friendly unit picked via the `might:` target
  // Expression.
  place(sourceCardId, "battlefield-bf-1", PLAYER, {
    cardType: "spell",
    id: sourceCardId,
    might: 0,
    name: "source",
  });
  // The friendly unit Alpha Strike picks ("Choose a friendly unit").
  place("friendly-bf", "battlefield-bf-1", PLAYER, {
    cardType: "unit",
    id: "friendly-bf",
    might: friendlyMight,
    name: "friendly-bf",
  });
  // Enemy units on the same battlefield row.
  for (let i = 0; i < enemiesAtBattlefield; i++) {
    place(`enemy-bf-${i + 1}`, "battlefield-bf-1", OPP, {
      cardType: "unit",
      id: `enemy-bf-${i + 1}`,
      might: 2,
      name: `enemy-bf-${i + 1}`,
    });
  }

  const draft = {
    battlefields: { "bf-1": { id: "bf-1" } },
    cardsPlayedThisTurn: { [PLAYER]: 0, [OPP]: 0 },
    conqueredThisTurn: { [PLAYER]: [], [OPP]: [] },
    gameId: "audited-broken-effects-test",
    interaction: {
      chain: {
        active: false,
        activePlayer: PLAYER,
        items: [],
        passedPlayers: [],
      },
      nextChainItemId: 1,
    },
    players: {
      [PLAYER]: { id: PLAYER, turnsTaken: 1, victoryPoints: 0, xp: 0 },
      [OPP]: { id: OPP, turnsTaken: 1, victoryPoints: 0, xp: 0 },
    },
    runePools: {
      [PLAYER]: { energy: 0, power: {} as Record<string, number> },
      [OPP]: { energy: 0, power: {} as Record<string, number> },
    },
    scoredThisTurn: { [PLAYER]: [], [OPP]: [] },
    status: "playing",
    turn: { activePlayer: PLAYER, number: 1, phase: "main" },
    turnEvents: { [PLAYER]: [], [OPP]: [] },
    unitsMovedThisTurn: { [PLAYER]: 0, [OPP]: 0 },
    victoryScore: 8,
    xpGainedThisTurn: { [PLAYER]: 0, [OPP]: 0 },
  } as unknown as EffectContext["draft"];

  const ctx: EffectContext = {
    cards: {
      getCardController: (id) => ownerOf.get(id as string),
      getCardMeta: (id) => meta.get(id as string),
      getCardOwner: (id) => ownerOf.get(id as string),
      updateCardMeta: (id, updates) => {
        const existing = meta.get(id as string) ?? {};
        meta.set(id as string, { ...existing, ...updates });
      },
    } as unknown as EffectContext["cards"],
    counters: {
      addCounter: (id, counter, amount) => {
        rec.counterAdds.push({ amount, cardId: id as string, counter });
      },
      clearCounter: () => {},
      removeCounter: () => {},
      setFlag: () => {},
    } as unknown as EffectContext["counters"],
    createCardInZone: (id, zone, owner) => {
      rec.createCalls.push({ cardId: id, ownerId: owner, zoneId: zone });
      zoneOf.set(id, zone);
      const arr = zoneCards.get(zone) ?? [];
      arr.push(id);
      zoneCards.set(zone, arr);
      ownerOf.set(id, owner);
    },
    draft,
    playerId: PLAYER,
    sourceCardId,
    sourceZone: "battlefield-bf-1",
    zones: {
      drawCards: () => [] as unknown as CoreCardId[],
      getCardZone: (id) => zoneOf.get(id as string),
      getCardsInZone: (zoneId, pid) => {
        const ids = zoneCards.get(zoneId as string) ?? [];
        if (pid !== undefined) {
          return ids.filter((id) => ownerOf.get(id) === pid) as unknown as CoreCardId[];
        }
        return ids as unknown as CoreCardId[];
      },
      moveCard: ({ cardId, targetZoneId }) => {
        rec.moves.push({ cardId: cardId as string, targetZoneId: targetZoneId as string });
        const prev = zoneOf.get(cardId as string);
        if (prev) {
          const arr = zoneCards.get(prev) ?? [];
          const idx = arr.indexOf(cardId as string);
          if (idx !== -1) {
            arr.splice(idx, 1);
          }
          zoneCards.set(prev, arr);
        }
        zoneOf.set(cardId as string, targetZoneId as string);
        const dst = zoneCards.get(targetZoneId as string) ?? [];
        dst.push(cardId as string);
        zoneCards.set(targetZoneId as string, dst);
      },
      shuffleZone: () => {},
    } as unknown as EffectContext["zones"],
  };

  return { ctx, rec };
}

// ---------------------------------------------------------------------------
// 1. Flurry of Feathers (unl-044-219) — modal `choice` must write a
//    `pick-mode` pendingChoice so the caster can pick a branch. This
//    Replaces the old auto-pick-first behavior that silently no-op'd
//    When the head option had no executable target (e.g. `counter` on an
//    Empty chain). The parser emits a 2-option choice:
//      [{ effect: { type: "counter" } },
//       { effect: { type: "create-token", amount: 4, token: {...} } }]
// ---------------------------------------------------------------------------

describe("Flurry of Feathers (unl-044-219) — choice writes pendingChoice", () => {
  const flurryEffect: ExecutableEffect = {
    options: [
      { effect: { type: "counter" } },
      {
        effect: {
          amount: 4,
          token: { keywords: ["Deflect"], might: 1, name: "Bird", type: "unit" },
          type: "create-token",
        },
      },
    ],
    type: "choice",
  } as unknown as ExecutableEffect;

  it("writes a pick-mode pendingChoice listing all options", () => {
    const { ctx } = buildCtx({ sourceCardId: "flurry-1" });

    executeEffect(flurryEffect, ctx);

    expect(ctx.draft.pendingChoice).toBeDefined();
    expect(ctx.draft.pendingChoice?.type).toBe("pick-mode");
    expect(ctx.draft.pendingChoice?.prompter).toBe(PLAYER);

    // The pendingChoice carries both options so the resolver can fire
    // Whichever branch the caster picks.
    const pc = ctx.draft.pendingChoice as {
      options: { index: number; effect: { type: string } }[];
    };
    expect(pc.options).toHaveLength(2);
    expect(pc.options[0]?.index).toBe(0);
    expect(pc.options[1]?.index).toBe(1);
    expect(pc.options[0]?.effect.type).toBe("counter");
    expect(pc.options[1]?.effect.type).toBe("create-token");
  });

  it("captures source context so the chosen branch resolves correctly", () => {
    const { ctx } = buildCtx({ sourceCardId: "flurry-2" });

    executeEffect(flurryEffect, ctx);

    expect(ctx.draft.pendingChoice).toBeDefined();
    const pc = ctx.draft.pendingChoice as {
      sourceCardId: string;
      sourceZone?: string;
    };
    expect(pc.sourceCardId).toBe("flurry-2");
    expect(pc.sourceZone).toBe("battlefield-bf-1");
  });

  it("does not produce a token directly — the create-token branch waits for resolution", () => {
    const { ctx, rec } = buildCtx({ sourceCardId: "flurry-3" });

    executeEffect(flurryEffect, ctx);

    // The choice handler pauses play; it does NOT auto-fire the
    // Create-token branch. createCalls stays empty until the caster
    // Resolves the pendingChoice via the move API.
    expect(rec.createCalls).toHaveLength(0);
    expect(ctx.draft.pendingChoice).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Alpha Strike (unl-192-219) — sequence applies `damage` then runs
//    `for-each` xp gain. The damage uses `{ amount: { might: <target> },
//    Split: true, target: { controller: "enemy", location: "battlefield",
//    Quantity: "all", type: "unit" } }`.
// ---------------------------------------------------------------------------

describe("Alpha Strike (unl-192-219) — split damage + xp for-each", () => {
  // Mirror the structured ability shape from cards/unl/alpha-strike.ts.
  const alphaEffect: ExecutableEffect = {
    effects: [
      {
        amount: { might: { controller: "friendly", type: "unit" } },
        split: true,
        target: {
          controller: "enemy",
          location: "battlefield",
          quantity: "all",
          type: "unit",
        },
        type: "damage",
      },
      {
        effect: { amount: 1, type: "gain-xp" },
        target: {
          controller: "enemy",
          filter: "damaged",
          location: "battlefield",
          type: "unit",
        },
        type: "for-each",
      },
    ],
    type: "sequence",
  } as unknown as ExecutableEffect;

  it("deals split damage to enemy units equal to the friendly unit's Might", () => {
    // Friendly unit has Might 4 (default in `buildCtx`). With 2 enemies
    // The 4 damage splits 2 / 2.
    const { ctx, rec } = buildCtx({
      enemiesAtBattlefield: 2,
      sourceCardId: "alpha-1",
    });

    executeEffect(alphaEffect, ctx);

    const damageAdds = rec.counterAdds.filter((c) => c.counter === "damage");
    expect(damageAdds).toHaveLength(2);
    const total = damageAdds.reduce((sum, a) => sum + a.amount, 0);
    expect(total).toBe(4);
    // Even split — each takes 2.
    for (const add of damageAdds) {
      expect(add.amount).toBe(2);
    }
  });

  it("distributes remainder front-loaded when damage doesn't divide evenly", () => {
    // 4 damage across 3 enemies → [2, 1, 1].
    const { ctx, rec } = buildCtx({
      enemiesAtBattlefield: 3,
      sourceCardId: "alpha-2",
    });

    executeEffect(alphaEffect, ctx);

    const damageAdds = rec.counterAdds.filter((c) => c.counter === "damage");
    expect(damageAdds).toHaveLength(3);
    expect(damageAdds.map((a) => a.amount)).toEqual([2, 1, 1]);
    expect(damageAdds.reduce((s, a) => s + a.amount, 0)).toBe(4);
  });

  it("scales with the friendly unit's Might (5 damage across 2 enemies → [3, 2])", () => {
    const { ctx, rec } = buildCtx({
      enemiesAtBattlefield: 2,
      friendlyMight: 5,
      sourceCardId: "alpha-3",
    });

    executeEffect(alphaEffect, ctx);

    const damageAdds = rec.counterAdds.filter((c) => c.counter === "damage");
    expect(damageAdds.map((a) => a.amount)).toEqual([3, 2]);
  });

  it("grants XP for each iteration of the for-each (engine fires per matched target)", () => {
    // With 2 enemy units (both "damaged" by the preceding split), the
    // For-each runs the gain-xp effect once per target. xp should be > 0.
    const { ctx } = buildCtx({
      enemiesAtBattlefield: 2,
      sourceCardId: "alpha-4",
    });

    executeEffect(alphaEffect, ctx);

    const xpAfter = (ctx.draft.players[PLAYER] as { xp: number }).xp;
    expect(xpAfter).toBeGreaterThan(0);
  });

  it("does no damage when there are no enemy units to target", () => {
    const { ctx, rec } = buildCtx({
      enemiesAtBattlefield: 0,
      sourceCardId: "alpha-5",
    });

    executeEffect(alphaEffect, ctx);

    const damageAdds = rec.counterAdds.filter((c) => c.counter === "damage");
    expect(damageAdds).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. `resolveAmount` direct coverage for `{ might: <TargetDescriptor> }`.
//    Damage handler tests cover the integration; this asserts the
//    Resolver isn't accidentally re-broken by future changes by
//    Exercising the same path through a 1-target damage with no
//    `split` flag.
// ---------------------------------------------------------------------------

describe("resolveAmount: { might: TargetDescriptor }", () => {
  const damageOnly: ExecutableEffect = {
    amount: { might: { controller: "friendly", type: "unit" } },
    target: {
      controller: "enemy",
      location: "battlefield",
      quantity: "all",
      type: "unit",
    },
    type: "damage",
  } as unknown as ExecutableEffect;

  it("reads the friendly unit's effective Might for damage amount", () => {
    const { ctx, rec } = buildCtx({
      enemiesAtBattlefield: 1,
      sourceCardId: "stormbringer-like",
    });

    executeEffect(damageOnly, ctx);

    const damageAdds = rec.counterAdds.filter((c) => c.counter === "damage");
    // Friendly Might is 4, only 1 enemy, no split flag → full amount.
    expect(damageAdds).toHaveLength(1);
    expect(damageAdds[0]?.amount).toBe(4);
  });
});
