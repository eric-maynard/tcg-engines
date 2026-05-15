/**
 * Effect Choice (pick-mode) tests.
 *
 * Covers the `choice` effect's new pendingChoice flow (modal "Choose
 * one — A. B." spells like Flurry of Feathers, Disposal Order, Curtain
 * Call) and the corresponding `resolvePendingChoice` move that fires
 * the chosen branch's effect.
 *
 *   1. `executeEffect({ type: "choice", options })` writes a
 *      `pick-mode` pendingChoice rather than auto-resolving.
 *   2. `resolvePendingChoice({ pickedOptionIndex: 0 })` fires option 0.
 *   3. `resolvePendingChoice({ pickedOptionIndex: 1 })` fires option 1.
 */

import { describe, expect, it } from "bun:test";
import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../abilities/effect-executor";
import { executeEffect } from "../abilities/effect-executor";
import { pendingChoiceMoves } from "../game-definition/moves/pending-choice";
import type { PickModeChoice, RiftboundGameState } from "../types";

const PLAYER = "p1";
const OPP = "p2";

interface Recorded {
  createCalls: { cardId: string; zoneId: string; ownerId: string }[];
  moveCalls: { cardId: string; targetZoneId: string }[];
  drawCalls: { count: number; playerId: string }[];
}

function buildCtx(sourceCardId: string): {
  ctx: EffectContext;
  rec: Recorded;
  draft: RiftboundGameState;
} {
  const rec: Recorded = { createCalls: [], drawCalls: [], moveCalls: [] };
  const zoneOf = new Map<string, string>();
  const zoneCards = new Map<string, string[]>();
  const ownerOf = new Map<string, string>();
  ownerOf.set(sourceCardId, PLAYER);
  zoneOf.set(sourceCardId, "trash");

  const draft = {
    battlefields: {},
    cardsPlayedThisTurn: { [PLAYER]: 0, [OPP]: 0 },
    conqueredThisTurn: { [PLAYER]: [], [OPP]: [] },
    gameId: "effect-choice-test",
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
    victoryScore: 8,
    xpGainedThisTurn: { [PLAYER]: 0, [OPP]: 0 },
  } as unknown as RiftboundGameState;

  const ctx: EffectContext = {
    cards: {
      getCardOwner: (id: CoreCardId) => ownerOf.get(id as string),
    } as unknown as EffectContext["cards"],
    counters: {
      addCounter: () => {},
      clearCounter: () => {},
      removeCounter: () => {},
      setFlag: () => {},
    },
    createCardInZone: (id, zone, owner) => {
      rec.createCalls.push({ cardId: id, ownerId: owner, zoneId: zone });
    },
    draft,
    playerId: PLAYER,
    sourceCardId,
    sourceZone: "trash",
    zones: {
      drawCards: ({ count, playerId }) => {
        rec.drawCalls.push({ count, playerId: playerId as string });
        return [] as unknown as CoreCardId[];
      },
      getCardZone: (id: CoreCardId) => zoneOf.get(id as string) as CoreZoneId | undefined,
      getCardsInZone: (zoneId: CoreZoneId, pid?: CorePlayerId) => {
        const ids = zoneCards.get(zoneId as string) ?? [];
        if (pid !== undefined) {
          return ids.filter((id) => ownerOf.get(id) === pid) as unknown as CoreCardId[];
        }
        return ids as unknown as CoreCardId[];
      },
      moveCard: ({ cardId, targetZoneId }) => {
        rec.moveCalls.push({
          cardId: cardId as string,
          targetZoneId: targetZoneId as string,
        });
      },
    },
  };

  return { ctx, draft, rec };
}

// ---------------------------------------------------------------------------
// 1. `choice` effect writes a pick-mode pendingChoice
// ---------------------------------------------------------------------------

describe("choice effect writes pick-mode pendingChoice", () => {
  const flurry: ExecutableEffect = {
    options: [
      { effect: { type: "counter" }, label: "Counter a spell" },
      {
        effect: {
          amount: 4,
          token: { keywords: ["Deflect"], might: 1, name: "Bird", type: "unit" },
          type: "create-token",
        },
        label: "Play 4 Bird tokens",
      },
    ],
    type: "choice",
  } as unknown as ExecutableEffect;

  it("writes a pick-mode pendingChoice with options[].index and labels", () => {
    const { ctx, draft, rec } = buildCtx("flurry-1");

    executeEffect(flurry, ctx);

    // The choice should pause play, NOT auto-resolve.
    expect(rec.createCalls).toHaveLength(0);
    expect(rec.moveCalls).toHaveLength(0);
    expect(draft.pendingChoice).toBeDefined();
    expect(draft.pendingChoice?.type).toBe("pick-mode");

    const pc = draft.pendingChoice as PickModeChoice;
    expect(pc.prompter).toBe(PLAYER);
    expect(pc.sourceCardId).toBe("flurry-1");
    expect(pc.sourceZone).toBe("trash");
    expect(pc.options).toHaveLength(2);
    expect(pc.options[0]?.index).toBe(0);
    expect(pc.options[0]?.label).toBe("Counter a spell");
    expect(pc.options[1]?.index).toBe(1);
    expect(pc.options[1]?.label).toBe("Play 4 Bird tokens");
  });

  it("falls back to a generic label when no label/description is set", () => {
    const { ctx, draft } = buildCtx("plain-1");
    const plainChoice: ExecutableEffect = {
      options: [
        { effect: { amount: 1, type: "draw" } },
        { effect: { amount: 2, type: "draw" } },
      ],
      type: "choice",
    } as unknown as ExecutableEffect;

    executeEffect(plainChoice, ctx);

    const pc = draft.pendingChoice as PickModeChoice;
    expect(pc.options[0]?.label).toBe("Option 1");
    expect(pc.options[1]?.label).toBe("Option 2");
  });

  it("does not clobber an existing pendingChoice", () => {
    const { ctx, draft } = buildCtx("flurry-2");
    draft.pendingChoice = {
      onPicked: "recycle",
      prompter: PLAYER,
      revealed: ["x"],
      revealer: OPP,
      type: "reveal-and-pick",
    };

    executeEffect(flurry, ctx);

    expect(draft.pendingChoice?.type).toBe("reveal-and-pick");
  });

  it("is a no-op when options is empty", () => {
    const { ctx, draft, rec } = buildCtx("empty-1");

    executeEffect(
      { options: [], type: "choice" } as unknown as ExecutableEffect,
      ctx,
    );

    expect(draft.pendingChoice).toBeUndefined();
    expect(rec.createCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. resolvePendingChoice — pickedOptionIndex fires the right branch
// ---------------------------------------------------------------------------

describe("resolvePendingChoice for pick-mode", () => {
  function makePickModeState(): RiftboundGameState {
    const { draft } = buildCtx("flurry-3");
    draft.pendingChoice = {
      options: [
        {
          effect: { amount: 7, type: "draw" } as unknown,
          index: 0,
          label: "Draw 7",
        },
        {
          effect: {
            amount: 4,
            token: { keywords: ["Deflect"], might: 1, name: "Bird", type: "unit" },
            type: "create-token",
          } as unknown,
          index: 1,
          label: "Play 4 Bird tokens",
        },
      ],
      prompter: PLAYER,
      sourceCardId: "flurry-3",
      sourceZone: "trash",
      type: "pick-mode",
    };
    return draft;
  }

  function buildReducerContext(
    state: RiftboundGameState,
    params: { playerId: string; pickedOptionIndex: number },
  ): {
    rec: Recorded;
    context: Parameters<
      NonNullable<typeof pendingChoiceMoves.resolvePendingChoice>["reducer"]
    >[1];
  } {
    const rec: Recorded = { createCalls: [], drawCalls: [], moveCalls: [] };
    const context = {
      cards: {
        getCardOwner: () => PLAYER,
      },
      counters: {
        addCounter: () => {},
        clearAllCounters: () => {},
        clearCounter: () => {},
        removeCounter: () => {},
        setFlag: () => {},
      },
      params,
      zones: {
        // Bridge the core-MoveContext shape (single-object param) so the
        // Pending-choice reducer can adapt it to the EffectContext's
        // 3-arg positional createCardInZone.
        createCardInZone: (p: {
          cardId: string;
          zoneId: string;
          ownerId: string;
        }) => {
          rec.createCalls.push({
            cardId: p.cardId,
            ownerId: p.ownerId,
            zoneId: p.zoneId,
          });
        },
        drawCards: (p: { count: number; playerId: string }) => {
          rec.drawCalls.push({ count: p.count, playerId: p.playerId });
          return [] as unknown[];
        },
        getCardZone: () => "trash",
        // Deck is non-empty so the draw handler doesn't trip Burn Out.
        getCardsInZone: (zoneId: string) => {
          if (zoneId === "mainDeck") {
            return ["deck-card-1"] as unknown[];
          }
          return [] as unknown[];
        },
        moveCard: (p: { cardId: string; targetZoneId: string }) => {
          rec.moveCalls.push(p);
        },
      },
    } as unknown as Parameters<
      NonNullable<typeof pendingChoiceMoves.resolvePendingChoice>["reducer"]
    >[1];
    return { context, rec };
  }

  it("fires option 0's effect when pickedOptionIndex=0", () => {
    const state = makePickModeState();
    const { context, rec } = buildReducerContext(state, {
      pickedOptionIndex: 0,
      playerId: PLAYER,
    });

    const move = pendingChoiceMoves.resolvePendingChoice!;
    move.reducer(state, context);

    // The draw handler loops, calling `drawCards({ count: 1 })` per card.
    expect(rec.drawCalls).toHaveLength(7);
    expect(rec.drawCalls[0]?.count).toBe(1);
    expect(rec.drawCalls[0]?.playerId).toBe(PLAYER);
    expect(rec.createCalls).toHaveLength(0);
    expect(state.pendingChoice).toBeUndefined();
  });

  it("fires option 1's effect when pickedOptionIndex=1", () => {
    const state = makePickModeState();
    const { context, rec } = buildReducerContext(state, {
      pickedOptionIndex: 1,
      playerId: PLAYER,
    });

    const move = pendingChoiceMoves.resolvePendingChoice!;
    move.reducer(state, context);

    expect(rec.createCalls).toHaveLength(4);
    for (const c of rec.createCalls) {
      expect(c.cardId).toContain("token-bird");
      expect(c.ownerId).toBe(PLAYER);
    }
    expect(rec.drawCalls).toHaveLength(0);
    expect(state.pendingChoice).toBeUndefined();
  });

  it("rejects an out-of-range option index via the condition predicate", () => {
    const state = makePickModeState();
    const { context } = buildReducerContext(state, {
      pickedOptionIndex: 99,
      playerId: PLAYER,
    });

    const move = pendingChoiceMoves.resolvePendingChoice!;
    const ok = move.condition!(state, context);
    expect(ok).toBe(false);
  });

  it("rejects when the wrong player tries to resolve", () => {
    const state = makePickModeState();
    const { context } = buildReducerContext(state, {
      pickedOptionIndex: 0,
      playerId: OPP, // Not the prompter.
    });

    const move = pendingChoiceMoves.resolvePendingChoice!;
    const ok = move.condition!(state, context);
    expect(ok).toBe(false);
  });

  it("enumerates one row per option", () => {
    const state = makePickModeState();
    const enumerator = pendingChoiceMoves.resolvePendingChoice!.enumerator!;
    const rows = enumerator(state, {
      playerId: PLAYER,
    } as Parameters<typeof enumerator>[1]);
    expect(rows).toHaveLength(2);
    const indices = (rows as { pickedOptionIndex: number }[]).map(
      (r) => r.pickedOptionIndex,
    );
    expect(indices.toSorted()).toEqual([0, 1]);
  });
});
