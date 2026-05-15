/**
 * `move` effect tests.
 *
 * Covers the Charm / Fight or Flight / Flash / Blitzcrank Impassive patterns:
 *   - "Move an enemy unit." (parser → target=enemy unit, to="base")
 *   - "Move a unit from a battlefield to its base."
 *     (parser → target=unit, from="battlefield", to="base")
 *   - "Move up to 2 friendly units to base."
 *     (parser → target=friendly unit qty=upTo2, to="base")
 *   - "When you play me to a battlefield, you may move an enemy unit to here."
 *     (parser → target=enemy unit, to="here")
 *
 * Audit: `/tmp/card-effect-coverage.json` flagged 34 cards relying on
 * `effect.type === "move"` as broken because the effect-executor lacked a
 * `case "move":`. These tests exercise the handler we added.
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
import type { RiftboundGameState } from "../types";

// ---------------------------------------------------------------------------
// Mock builder — a stripped-down EffectContext with two players, a single
// Battlefield, and a small set of placed units. Tracks moveCard calls so
// Tests can assert on the final zone transfers.
// ---------------------------------------------------------------------------

interface BoardCard {
  id: string;
  owner: string;
  zone: string;
  cardType?: string;
}

interface MockOptions {
  /** ID of the source card resolving this effect (defaults to "source-spell" in p1 hand). */
  sourceCardId?: string;
  sourceZone?: string;
  playerId?: string;
  battlefieldIds?: string[];
  cards: BoardCard[];
}

function buildMockCtx(opts: MockOptions): {
  ctx: EffectContext;
  draft: RiftboundGameState;
  zoneOf: Map<string, string>;
  movedCalls: { cardId: string; targetZoneId: string }[];
  firedEvents: { type: string; cardId?: string; from?: string; to?: string }[];
} {
  const playerId = opts.playerId ?? "p1";
  const oppId = playerId === "p1" ? "p2" : "p1";
  const sourceCardId = opts.sourceCardId ?? "source-spell";
  const sourceZone = opts.sourceZone ?? "hand";
  const bfIds = opts.battlefieldIds ?? ["bf-1"];

  const zoneOf = new Map<string, string>();
  const zoneCards = new Map<string, string[]>();
  const ownerOf = new Map<string, string>();

  const placeCard = (id: string, zone: string, owner: string, cardType?: string): void => {
    zoneOf.set(id, zone);
    ownerOf.set(id, owner);
    const arr = zoneCards.get(zone) ?? [];
    arr.push(id);
    zoneCards.set(zone, arr);
    const reg = getGlobalCardRegistry();
    reg.register(id, { cardType: cardType ?? "unit", id, might: 3, name: id });
  };

  // Place source.
  placeCard(sourceCardId, sourceZone, playerId, "spell");

  // Place every card from opts.cards.
  for (const c of opts.cards) {
    placeCard(c.id, c.zone, c.owner, c.cardType ?? "unit");
  }

  const movedCalls: { cardId: string; targetZoneId: string }[] = [];
  const firedEvents: { type: string; cardId?: string; from?: string; to?: string }[] = [];

  const battlefields: Record<string, unknown> = {};
  for (const bfId of bfIds) {
    battlefields[bfId] = { id: bfId };
  }

  const draft: RiftboundGameState = {
    battlefields,
    gameId: "move-test",
    players: {
      [playerId]: { id: playerId, victoryPoints: 0, xp: 0 },
      [oppId]: { id: oppId, victoryPoints: 0, xp: 0 },
    },
    runePools: {},
    status: "playing",
    turn: { activePlayer: playerId, number: 1, phase: "main" },
    victoryScore: 8,
  } as unknown as RiftboundGameState;

  const ctx: EffectContext = {
    cards: {
      getCardController: (id) => ownerOf.get(id as string),
      getCardMeta: () => ({}),
      getCardOwner: (id) => ownerOf.get(id as string),
      updateCardMeta: () => {},
    } as unknown as EffectContext["cards"],
    counters: {
      addCounter: () => {},
      clearCounter: () => {},
      removeCounter: () => {},
      setFlag: () => {},
    },
    draft,
    fireTriggers: (event) => {
      firedEvents.push(event as unknown as { type: string });
    },
    playerId,
    sourceCardId,
    sourceZone,
    zones: {
      drawCards: () => [] as unknown as CoreCardId[],
      getCardZone: (id) => zoneOf.get(id as string) as CoreZoneId | undefined,
      getCardsInZone: (zoneId, pid) => {
        const ids = zoneCards.get(zoneId as string) ?? [];
        if (pid !== undefined) {
          return ids.filter((id) => ownerOf.get(id) === (pid as string)) as unknown as CoreCardId[];
        }
        return ids as unknown as CoreCardId[];
      },
      moveCard: ({ cardId, targetZoneId }) => {
        movedCalls.push({ cardId: cardId as string, targetZoneId: targetZoneId as string });
        const prev = zoneOf.get(cardId as string);
        if (prev) {
          const arr = zoneCards.get(prev) ?? [];
          const idx = arr.indexOf(cardId as string);
          if (idx !== -1) {
            arr.splice(idx, 1);
          }
        }
        zoneOf.set(cardId as string, targetZoneId as string);
        const dst = zoneCards.get(targetZoneId as string) ?? [];
        dst.push(cardId as string);
        zoneCards.set(targetZoneId as string, dst);
      },
    },
  };

  return { ctx, draft, firedEvents, movedCalls, zoneOf };
}

// ---------------------------------------------------------------------------
// Charm-pattern: "Move an enemy unit." → target=enemy unit, to="base"
// ---------------------------------------------------------------------------

describe("move effect (Charm pattern: enemy unit → its base)", () => {
  it("moves an enemy unit from battlefield to its (the enemy's) base zone", () => {
    const { ctx, movedCalls, zoneOf } = buildMockCtx({
      cards: [{ id: "enemy-u", owner: "p2", zone: "battlefield-bf-1" }],
    });

    const effect: ExecutableEffect = {
      target: { controller: "enemy", type: "unit" },
      to: "base",
      type: "move",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(movedCalls).toHaveLength(1);
    expect(movedCalls[0]).toEqual({ cardId: "enemy-u", targetZoneId: "base" });
    expect(zoneOf.get("enemy-u")).toBe("base");
  });

  it("does NOT pick a friendly unit when controller=enemy", () => {
    const { ctx, movedCalls } = buildMockCtx({
      cards: [
        { id: "friendly-u", owner: "p1", zone: "battlefield-bf-1" },
        { id: "enemy-u", owner: "p2", zone: "battlefield-bf-1" },
      ],
    });

    const effect: ExecutableEffect = {
      target: { controller: "enemy", type: "unit" },
      to: "base",
      type: "move",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(movedCalls).toHaveLength(1);
    expect(movedCalls[0]?.cardId).toBe("enemy-u");
  });

  it("fires a `move` GameEvent for triggered-ability listeners", () => {
    const { ctx, firedEvents } = buildMockCtx({
      cards: [{ id: "enemy-u", owner: "p2", zone: "battlefield-bf-1" }],
    });

    const effect: ExecutableEffect = {
      target: { controller: "enemy", type: "unit" },
      to: "base",
      type: "move",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    const moveEvents = firedEvents.filter((e) => e.type === "move");
    expect(moveEvents).toHaveLength(1);
    expect(moveEvents[0]).toMatchObject({
      cardId: "enemy-u",
      from: "battlefield-bf-1",
      to: "base",
      type: "move",
    });
  });
});

// ---------------------------------------------------------------------------
// Fight-or-Flight pattern: target=unit, from="battlefield", to="base"
// ---------------------------------------------------------------------------

describe("move effect (Fight or Flight pattern: from a battlefield to its base)", () => {
  it("moves a battlefield unit to base", () => {
    const { ctx, movedCalls, zoneOf } = buildMockCtx({
      cards: [{ id: "bf-unit", owner: "p1", zone: "battlefield-bf-1" }],
    });

    const effect: ExecutableEffect = {
      from: "battlefield",
      target: { type: "unit" },
      to: "base",
      type: "move",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(movedCalls).toHaveLength(1);
    expect(movedCalls[0]).toEqual({ cardId: "bf-unit", targetZoneId: "base" });
    expect(zoneOf.get("bf-unit")).toBe("base");
  });

  it("ignores units currently on base when from=battlefield", () => {
    // Two candidate units: one on base, one on a battlefield. The `from`
    // Filter should restrict us to the battlefield one.
    const { ctx, movedCalls } = buildMockCtx({
      cards: [
        { id: "base-unit", owner: "p1", zone: "base" },
        { id: "bf-unit", owner: "p1", zone: "battlefield-bf-1" },
      ],
    });

    const effect: ExecutableEffect = {
      from: "battlefield",
      target: { quantity: "all", type: "unit" },
      to: "base",
      type: "move",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(movedCalls).toHaveLength(1);
    expect(movedCalls[0]?.cardId).toBe("bf-unit");
  });
});

// ---------------------------------------------------------------------------
// Flash pattern: "Move up to 2 friendly units to base."
// ---------------------------------------------------------------------------

describe("move effect (Flash pattern: friendly units to base)", () => {
  it("moves all matching friendly units to base", () => {
    const { ctx, movedCalls, zoneOf } = buildMockCtx({
      cards: [
        { id: "u1", owner: "p1", zone: "battlefield-bf-1" },
        { id: "u2", owner: "p1", zone: "battlefield-bf-1" },
        { id: "u3", owner: "p2", zone: "battlefield-bf-1" },
      ],
    });

    const effect: ExecutableEffect = {
      target: { controller: "friendly", quantity: "all", type: "unit" },
      to: "base",
      type: "move",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(movedCalls).toHaveLength(2);
    expect(zoneOf.get("u1")).toBe("base");
    expect(zoneOf.get("u2")).toBe("base");
    expect(zoneOf.get("u3")).toBe("battlefield-bf-1");
  });

  it("respects { upTo: N } quantity", () => {
    const { ctx, movedCalls } = buildMockCtx({
      cards: [
        { id: "u1", owner: "p1", zone: "battlefield-bf-1" },
        { id: "u2", owner: "p1", zone: "battlefield-bf-1" },
        { id: "u3", owner: "p1", zone: "battlefield-bf-1" },
      ],
    });

    const effect: ExecutableEffect = {
      target: { controller: "friendly", quantity: { upTo: 2 }, type: "unit" },
      to: "base",
      type: "move",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(movedCalls).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Blitzcrank pattern: move enemy unit to "here" (source's zone)
// ---------------------------------------------------------------------------

describe("move effect (Blitzcrank pattern: enemy unit → here)", () => {
  it("moves enemy unit to the source card's current zone", () => {
    const { ctx, movedCalls, zoneOf } = buildMockCtx({
      cards: [{ id: "enemy-u", owner: "p2", zone: "base" }],
      sourceCardId: "blitz",
      sourceZone: "battlefield-bf-1",
    });

    const effect: ExecutableEffect = {
      target: { controller: "enemy", type: "unit" },
      to: "here",
      type: "move",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(movedCalls).toHaveLength(1);
    expect(movedCalls[0]).toEqual({ cardId: "enemy-u", targetZoneId: "battlefield-bf-1" });
    expect(zoneOf.get("enemy-u")).toBe("battlefield-bf-1");
  });

  it("is a no-op when target is already at source zone", () => {
    const { ctx, movedCalls } = buildMockCtx({
      cards: [{ id: "enemy-u", owner: "p2", zone: "battlefield-bf-1" }],
      sourceCardId: "blitz",
      sourceZone: "battlefield-bf-1",
    });

    const effect: ExecutableEffect = {
      target: { controller: "enemy", type: "unit" },
      to: "here",
      type: "move",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(movedCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Move to battlefield (base → battlefield) — Fae Porter style
// ---------------------------------------------------------------------------

describe("move effect (base → battlefield)", () => {
  it("moves a friendly unit from base onto a battlefield", () => {
    const { ctx, movedCalls, zoneOf } = buildMockCtx({
      cards: [{ id: "u1", owner: "p1", zone: "base" }],
    });

    const effect: ExecutableEffect = {
      target: { controller: "friendly", type: "unit" },
      to: "battlefield",
      type: "move",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(movedCalls).toHaveLength(1);
    expect(movedCalls[0]?.targetZoneId).toBe("battlefield-bf-1");
    expect(zoneOf.get("u1")).toBe("battlefield-bf-1");
  });

  it("when multiple battlefields exist, picks one that isn't the current zone", () => {
    // Unit currently on bf-1 should be moved to bf-2 when `to: battlefield`.
    const { ctx, movedCalls } = buildMockCtx({
      battlefieldIds: ["bf-1", "bf-2"],
      cards: [{ id: "u1", owner: "p1", zone: "battlefield-bf-1" }],
    });

    const effect: ExecutableEffect = {
      target: { controller: "friendly", type: "unit" },
      to: "battlefield",
      type: "move",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(movedCalls).toHaveLength(1);
    expect(movedCalls[0]?.targetZoneId).toBe("battlefield-bf-2");
  });
});

// ---------------------------------------------------------------------------
// Edge cases — empty target, missing destination
// ---------------------------------------------------------------------------

describe("move effect (edge cases)", () => {
  it("does nothing when target matches no card", () => {
    const { ctx, movedCalls } = buildMockCtx({
      cards: [],
    });

    const effect: ExecutableEffect = {
      target: { controller: "enemy", type: "unit" },
      to: "base",
      type: "move",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(movedCalls).toHaveLength(0);
  });

  it("moves the source card itself when target is self", () => {
    // Bard / Azir Sovereign use "move me to ..." — target=self, to=here etc.
    // The mock places source at sourceZone; "to: base" should land it on base.
    const { ctx, movedCalls, zoneOf } = buildMockCtx({
      cards: [],
      sourceCardId: "me",
      sourceZone: "battlefield-bf-1",
    });

    const effect: ExecutableEffect = {
      target: "self",
      to: "base",
      type: "move",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(movedCalls).toHaveLength(1);
    expect(movedCalls[0]).toEqual({ cardId: "me", targetZoneId: "base" });
    expect(zoneOf.get("me")).toBe("base");
  });

  it("is a no-op when destination is invalid (to=battlefield with no battlefields)", () => {
    const { ctx, movedCalls } = buildMockCtx({
      battlefieldIds: [],
      cards: [{ id: "u1", owner: "p1", zone: "base" }],
    });

    const effect: ExecutableEffect = {
      target: { controller: "friendly", type: "unit" },
      to: "battlefield",
      type: "move",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(movedCalls).toHaveLength(0);
  });

  // Regression: Ezreal, Dashing — bare-string `target: "self"` with other
  // Board cards present. Before the resolver-side fix, the bare string
  // Fell through to the board-scan branch, which returned a non-self card
  // And caused the move handler to act on the wrong unit (or no-op).
  it("moves the source even when other unrelated units exist on the board (bare-string target: 'self')", () => {
    const { ctx, movedCalls, zoneOf } = buildMockCtx({
      cards: [
        { id: "decoy-friendly-base", owner: "p1", zone: "base" },
        { id: "decoy-friendly-bf", owner: "p1", zone: "battlefield-bf-1" },
        { id: "decoy-enemy-bf", owner: "p2", zone: "battlefield-bf-1" },
      ],
      sourceCardId: "ezreal",
      sourceZone: "battlefield-bf-1",
    });

    const effect: ExecutableEffect = {
      target: "self",
      to: "base",
      type: "move",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(movedCalls).toHaveLength(1);
    expect(movedCalls[0]).toEqual({ cardId: "ezreal", targetZoneId: "base" });
    expect(zoneOf.get("ezreal")).toBe("base");
    // Decoys untouched.
    expect(zoneOf.get("decoy-friendly-base")).toBe("base");
    expect(zoneOf.get("decoy-friendly-bf")).toBe("battlefield-bf-1");
    expect(zoneOf.get("decoy-enemy-bf")).toBe("battlefield-bf-1");
  });
});

// ---------------------------------------------------------------------------
// Tricksy Tentacles pattern: `quantity: "any"` — multi-target move
// ---------------------------------------------------------------------------

describe("move effect (Tricksy Tentacles pattern: quantity 'any')", () => {
  it("moves all matching enemy units when quantity is 'any'", () => {
    const { ctx, movedCalls, zoneOf } = buildMockCtx({
      battlefieldIds: ["bf-1", "bf-2"],
      cards: [
        { id: "e1", owner: "p2", zone: "battlefield-bf-1" },
        { id: "e2", owner: "p2", zone: "battlefield-bf-1" },
        { id: "e3", owner: "p2", zone: "battlefield-bf-1" },
        { id: "friend", owner: "p1", zone: "battlefield-bf-1" },
      ],
      sourceCardId: "tricksy",
      sourceZone: "battlefield-bf-1",
    });

    const effect: ExecutableEffect = {
      target: {
        controller: "enemy",
        location: "battlefield",
        quantity: "any",
        type: "unit",
      },
      to: { battlefield: "any" },
      type: "move",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    // All three enemies should move to bf-2 (the non-source battlefield).
    expect(movedCalls).toHaveLength(3);
    for (const e of ["e1", "e2", "e3"]) {
      expect(zoneOf.get(e)).toBe("battlefield-bf-2");
    }
    // Friendly unit untouched.
    expect(zoneOf.get("friend")).toBe("battlefield-bf-1");
  });
});
