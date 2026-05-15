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
 * Root causes:
 *
 *   1. The `choice` effect handler hard-picked `options[0]` regardless of
 *      whether that option could actually do anything. Flurry's first
 *      option is `counter`, which is a no-op when the chain has no items
 *      below the counter to target — so the choice silently did nothing.
 *      Fix: the handler now skips options whose primary effect has a hard
 *      prerequisite the current context cannot satisfy and falls through
 *      to the next option.
 *
 *   2. `resolveAmount` only understood `{ might: "self" }` — when the
 *      parser emits `{ might: <TargetDescriptor> }` (Alpha Strike's "deals
 *      damage equal to its Might" where "it" is the chosen friendly
 *      unit), the resolver fell through to 0 and the damage handler
 *      added no counters. Fix: when `might` is a TargetDescriptor, the
 *      resolver picks the first matching unit and returns its effective
 *      Might.
 *
 *   3. The `damage` handler ignored the parser-emitted `split: true`
 *      flag — Alpha Strike's "split among enemy units" was treated as
 *      "deal that much to each", which is incorrect in real play. Fix:
 *      when `split: true`, the engine partitions the total damage across
 *      the resolved targets evenly with remainder front-loaded.
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
  /** Optional pre-existing chain items so a `counter` option has a target. */
  chainItems?: { id: string; countered?: boolean }[];
  /** Additional enemy units on battlefield-bf-1 (default: 0). */
  enemiesAtBattlefield?: number;
}): { ctx: EffectContext; rec: Recorded } {
  const { sourceCardId, chainItems = [], enemiesAtBattlefield = 0 } = args;

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

  // Source spell.
  place(sourceCardId, "battlefield-bf-1", PLAYER, {
    cardType: "spell",
    id: sourceCardId,
    might: 0,
    name: "source",
  });
  // The friendly unit Alpha Strike picks ("Choose a friendly unit"); Might 4
  // So we can verify split-damage allocation.
  place("friendly-bf", "battlefield-bf-1", PLAYER, {
    cardType: "unit",
    id: "friendly-bf",
    might: 4,
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
        active: chainItems.length > 0,
        activePlayer: PLAYER,
        items: chainItems.map((c) => ({
          countered: c.countered ?? false,
          id: c.id,
        })),
        passedPlayers: [],
      },
      nextChainItemId: chainItems.length + 1,
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
// 1. Flurry of Feathers (unl-044-219) — `choice` wrapper must produce a
//    Side-effect even when the head option (`counter`) has no chain item to
//    Target. The parser emits a 2-option choice:
//      [{ effect: { type: "counter" } },
//       { effect: { type: "create-token", amount: 4, token: {...} } }]
// ---------------------------------------------------------------------------

describe("Flurry of Feathers (unl-044-219) — choice fallthrough", () => {
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

  it("falls through to create-token when no chain item is available to counter", () => {
    const { ctx, rec } = buildCtx({ sourceCardId: "flurry-1" });

    executeEffect(flurryEffect, ctx);

    // No chain item → counter is a no-op → engine falls through to the
    // Second option and creates the four Bird tokens.
    expect(rec.createCalls).toHaveLength(4);
    for (const c of rec.createCalls) {
      expect(c.cardId).toContain("token-bird");
      expect(c.ownerId).toBe(PLAYER);
    }
  });

  it("picks counter when the chain has an uncountered item", () => {
    const { ctx } = buildCtx({
      chainItems: [{ id: "chain-1" }],
      sourceCardId: "flurry-2",
    });

    executeEffect(flurryEffect, ctx);

    // The (only) chain item is marked countered; no tokens were created
    // Because the engine accepted the first option as executable.
    const item = ctx.draft.interaction!.chain.items[0] as { countered?: boolean };
    expect(item.countered).toBe(true);
  });

  it("falls through when every chain item is already countered", () => {
    const { ctx, rec } = buildCtx({
      chainItems: [{ countered: true, id: "chain-1" }],
      sourceCardId: "flurry-3",
    });

    executeEffect(flurryEffect, ctx);

    // All chain items already countered → counter has no work → tokens.
    expect(rec.createCalls).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// 2. Alpha Strike (unl-192-219) — sequence must apply `damage` then run
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
    // Friendly unit has Might 4 (set in `buildCtx`). With 2 enemies the
    // 4 damage splits 2 / 2.
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

  it("grants XP for each iteration of the for-each (engine fires per matched target)", () => {
    // With 2 enemy units (both "damaged" by the preceding split), the
    // For-each runs the gain-xp effect once per target.
    const { ctx } = buildCtx({
      enemiesAtBattlefield: 2,
      sourceCardId: "alpha-3",
    });

    executeEffect(alphaEffect, ctx);

    const xpAfter = (ctx.draft.players[PLAYER] as { xp: number }).xp;
    expect(xpAfter).toBeGreaterThan(0);
  });

  it("does no damage when there are no enemy units to target", () => {
    const { ctx, rec } = buildCtx({
      enemiesAtBattlefield: 0,
      sourceCardId: "alpha-4",
    });

    executeEffect(alphaEffect, ctx);

    const damageAdds = rec.counterAdds.filter((c) => c.counter === "damage");
    expect(damageAdds).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. resolveAmount — direct coverage for `{ might: <TargetDescriptor> }`.
//    Damage handler tests cover the integration; this asserts the
//    Resolver isn't accidentally re-broken by future changes by exercising
//    The same path through a 1-effect damage.
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
    // Friendly Might is 4, only 1 enemy, no split flag — full amount.
    expect(damageAdds).toHaveLength(1);
    expect(damageAdds[0]?.amount).toBe(4);
  });
});
