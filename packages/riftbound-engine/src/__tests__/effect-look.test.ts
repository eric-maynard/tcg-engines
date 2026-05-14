/**
 * `look` effect tests.
 *
 * Covers the Stacked Deck pattern:
 *   "Look at the top 3 cards of your Main Deck. Put 1 into your hand and
 *    recycle the rest."
 *
 * The engine handles this in two phases:
 *   1. `look` effect writes a `pendingChoice` of type `"look-and-pick"`
 *      with the top-N cards as the `revealed` snapshot.
 *   2. `resolvePendingChoice` (in moves/pending-choice.ts) moves the
 *      picked card to its destination (`onPicked`) and recycles or
 *      otherwise disposes of the rest (`onUnpicked`).
 */

import { describe, expect, it } from "bun:test";
import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../abilities/effect-executor";
import { executeEffect } from "../abilities/effect-executor";
import type { LookAndPickChoice, RiftboundGameState } from "../types";
import { pendingChoiceMoves } from "../game-definition/moves/pending-choice";

// ---------------------------------------------------------------------------
// Mock builder — a minimal EffectContext with a stubbed main-deck zone for
// The active player. Tracks moveCard calls so resolution tests can assert
// On the final card movements.
// ---------------------------------------------------------------------------

interface MockOptions {
  playerId?: string;
  deckTop?: string[];
}

function buildMockCtx(opts: MockOptions = {}): {
  ctx: EffectContext;
  draft: RiftboundGameState;
  zoneOf: Map<string, string>;
  movedCalls: { cardId: string; targetZoneId: string; position?: string }[];
} {
  const playerId = opts.playerId ?? "p1";
  const deckTop = opts.deckTop ?? [];

  const zoneOf = new Map<string, string>();
  for (const cardId of deckTop) {
    zoneOf.set(cardId, "mainDeck");
  }
  const movedCalls: { cardId: string; targetZoneId: string; position?: string }[] = [];

  const draft: RiftboundGameState = {
    battlefields: {},
    conqueredThisTurn: {},
    gameId: "look-test",
    players: {
      [playerId]: { id: playerId, victoryPoints: 0, xp: 0 },
    },
    runePools: {},
    scoredThisTurn: {},
    status: "playing",
    turn: { activePlayer: playerId, number: 1, phase: "main" },
    victoryScore: 8,
    xpGainedThisTurn: {},
  } as unknown as RiftboundGameState;

  const ctx: EffectContext = {
    cards: {
      getCardMeta: () => ({}),
      getCardOwner: () => playerId,
      updateCardMeta: () => {},
    },
    counters: {
      addCounter: () => {},
      clearCounter: () => {},
      removeCounter: () => {},
      setFlag: () => {},
    },
    draft,
    playerId,
    sourceCardId: "source-spell",
    zones: {
      drawCards: () => [] as unknown as CoreCardId[],
      getCardZone: (cardId: CoreCardId) => zoneOf.get(cardId as string) as CoreZoneId | undefined,
      getCardsInZone: (zoneId: CoreZoneId, pid?: CorePlayerId) => {
        if (zoneId === ("mainDeck" as CoreZoneId) && pid === (playerId as CorePlayerId)) {
          return deckTop as unknown as CoreCardId[];
        }
        return [] as CoreCardId[];
      },
      moveCard: ({ cardId, targetZoneId, position }) => {
        movedCalls.push({
          cardId: cardId as string,
          targetZoneId: targetZoneId as string,
          ...(position ? { position: position as string } : {}),
        });
        zoneOf.set(cardId as string, targetZoneId as string);
      },
    },
  };

  return { ctx, draft, movedCalls, zoneOf };
}

// ---------------------------------------------------------------------------
// 1. `look` effect writes a look-and-pick pendingChoice
// ---------------------------------------------------------------------------

describe("look effect (Stacked Deck pattern)", () => {
  it("writes a look-and-pick pendingChoice with the top N cards", () => {
    const { ctx, draft } = buildMockCtx({
      deckTop: ["top-1", "top-2", "top-3", "top-4", "top-5"],
    });

    const effect: ExecutableEffect = {
      amount: 3,
      from: "deck",
      then: { recycle: "rest" },
      type: "look",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(draft.pendingChoice).toBeDefined();
    expect(draft.pendingChoice?.type).toBe("look-and-pick");
    const pc = draft.pendingChoice as LookAndPickChoice;
    expect(pc.prompter).toBe("p1");
    expect(pc.revealer).toBe("p1");
    expect(pc.revealed).toEqual(["top-1", "top-2", "top-3"]);
    expect(pc.onPicked).toBe("to-hand");
    expect(pc.onUnpicked).toBe("recycle");
  });

  it("does nothing when the deck is empty", () => {
    const { ctx, draft } = buildMockCtx({ deckTop: [] });

    const effect: ExecutableEffect = {
      amount: 3,
      from: "deck",
      then: { recycle: "rest" },
      type: "look",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(draft.pendingChoice).toBeUndefined();
  });

  it("does nothing for a peek with no `then` directive", () => {
    const { ctx, draft } = buildMockCtx({ deckTop: ["a", "b"] });

    const effect: ExecutableEffect = {
      amount: 1,
      from: "deck",
      type: "look",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    // Pure peek — no pendingChoice, no state changes.
    expect(draft.pendingChoice).toBeUndefined();
  });

  it("clamps reveal count to deck size", () => {
    const { ctx, draft } = buildMockCtx({ deckTop: ["only-1"] });

    const effect: ExecutableEffect = {
      amount: 3,
      from: "deck",
      then: { recycle: "rest" },
      type: "look",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(draft.pendingChoice?.revealed).toEqual(["only-1"]);
  });

  it("uses runeDeck zone when from === 'rune-deck'", () => {
    const { ctx, draft } = buildMockCtx({ deckTop: [] });
    // Override the zone to return rune-deck contents specifically.
    let observedZone: string | undefined;
    (ctx.zones as unknown as {
      getCardsInZone: (zoneId: CoreZoneId, pid: CorePlayerId) => CoreCardId[];
    }).getCardsInZone = (zoneId, _pid) => {
      observedZone = zoneId as string;
      if (zoneId === ("runeDeck" as CoreZoneId)) {
        return ["rune-top"] as unknown as CoreCardId[];
      }
      return [] as CoreCardId[];
    };

    const effect: ExecutableEffect = {
      amount: 1,
      from: "rune-deck",
      then: { recycle: "rest" },
      type: "look",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(observedZone).toBe("runeDeck");
    expect(draft.pendingChoice?.revealed).toEqual(["rune-top"]);
  });
});

// ---------------------------------------------------------------------------
// 2. resolvePendingChoice routes the pick to hand and recycles the rest
// ---------------------------------------------------------------------------

describe("resolvePendingChoice for look-and-pick", () => {
  function makeStateWithLookChoice(): RiftboundGameState {
    return {
      battlefields: {},
      conqueredThisTurn: {},
      gameId: "look-resolve",
      pendingChoice: {
        onPicked: "to-hand",
        onUnpicked: "recycle",
        prompter: "p1",
        revealed: ["top-1", "top-2", "top-3"],
        revealer: "p1",
        type: "look-and-pick",
      },
      players: {
        p1: { id: "p1", victoryPoints: 0, xp: 0 },
      },
      runePools: {},
      scoredThisTurn: {},
      status: "playing",
      turn: { activePlayer: "p1", number: 1, phase: "main" },
      victoryScore: 8,
      xpGainedThisTurn: {},
    } as unknown as RiftboundGameState;
  }

  it("moves the picked card to hand and recycles the rest to bottom of deck", () => {
    const state = makeStateWithLookChoice();
    const moves: { cardId: string; targetZoneId: string; position?: string }[] = [];
    const context = {
      cards: { getCardOwner: () => "p1" },
      counters: { clearAllCounters: () => {} },
      params: { pickedCardId: "top-2", playerId: "p1" },
      zones: {
        moveCard: (p: { cardId: string; targetZoneId: string; position?: string }) => {
          moves.push(p);
        },
      },
    };
    // Biome-ignore lint/suspicious/noExplicitAny: reducer signature varies
    const move = pendingChoiceMoves.resolvePendingChoice as any;
    move.reducer(state, context);

    // Picked card → hand (no position — default top).
    const handMove = moves.find((m) => m.targetZoneId === "hand");
    expect(handMove?.cardId).toBe("top-2");

    // Unpicked cards → mainDeck bottom (recycle).
    const recycleMoves = moves.filter(
      (m) => m.targetZoneId === "mainDeck" && m.position === "bottom",
    );
    expect(recycleMoves.map((m) => m.cardId).toSorted()).toEqual(["top-1", "top-3"]);

    // PendingChoice cleared so play can resume.
    expect(state.pendingChoice).toBeUndefined();
  });

  it("condition allows ANY revealed card as a pick (no card-type filter)", () => {
    const state = makeStateWithLookChoice();
    const context = {
      cards: { getCardMeta: () => undefined, getCardOwner: () => "p1" },
      counters: { clearAllCounters: () => {} },
      params: { pickedCardId: "top-1", playerId: "p1" },
      zones: { moveCard: () => {} },
    };
    // Biome-ignore lint/suspicious/noExplicitAny: condition signature varies
    const move = pendingChoiceMoves.resolvePendingChoice as any;
    expect(move.condition(state, context)).toBe(true);

    const altContext = { ...context, params: { pickedCardId: "top-3", playerId: "p1" } };
    expect(move.condition(state, altContext)).toBe(true);
  });

  it("condition rejects a pick that wasn't in the revealed snapshot", () => {
    const state = makeStateWithLookChoice();
    const context = {
      cards: { getCardMeta: () => undefined, getCardOwner: () => "p1" },
      counters: { clearAllCounters: () => {} },
      params: { pickedCardId: "not-revealed", playerId: "p1" },
      zones: { moveCard: () => {} },
    };
    // Biome-ignore lint/suspicious/noExplicitAny: condition signature varies
    const move = pendingChoiceMoves.resolvePendingChoice as any;
    expect(move.condition(state, context)).toBe(false);
  });

  it("enumerator returns one entry per revealed card", () => {
    const state = makeStateWithLookChoice();
    const context = {
      cards: { getCardOwner: () => "p1" },
      counters: { clearAllCounters: () => {} },
      playerId: "p1",
      zones: { getCardsInZone: () => [], moveCard: () => {} },
    };
    // Biome-ignore lint/suspicious/noExplicitAny: enumerator signature varies
    const move = pendingChoiceMoves.resolvePendingChoice as any;
    const enumerated = move.enumerator(state, context);
    expect(enumerated).toEqual([
      { pickedCardId: "top-1", playerId: "p1" },
      { pickedCardId: "top-2", playerId: "p1" },
      { pickedCardId: "top-3", playerId: "p1" },
    ]);
  });

  it("respects onUnpicked === 'trash' (mill the rest)", () => {
    const state = makeStateWithLookChoice();
    if (state.pendingChoice && state.pendingChoice.type === "look-and-pick") {
      (state.pendingChoice as { onUnpicked: string }).onUnpicked = "trash";
    }
    const moves: { cardId: string; targetZoneId: string; position?: string }[] = [];
    const context = {
      cards: { getCardOwner: () => "p1" },
      counters: { clearAllCounters: () => {} },
      params: { pickedCardId: "top-2", playerId: "p1" },
      zones: {
        moveCard: (p: { cardId: string; targetZoneId: string; position?: string }) => {
          moves.push(p);
        },
      },
    };
    // Biome-ignore lint/suspicious/noExplicitAny: reducer signature varies
    const move = pendingChoiceMoves.resolvePendingChoice as any;
    move.reducer(state, context);

    const trashMoves = moves.filter((m) => m.targetZoneId === "trash");
    expect(trashMoves.map((m) => m.cardId).toSorted()).toEqual(["top-1", "top-3"]);
  });
});

// ---------------------------------------------------------------------------
// 3. End-to-end: look writes pendingChoice, resolve completes the flow
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 3b. Extended `then` shapes — Vision keyword cards and numeric variants
// ---------------------------------------------------------------------------

describe("look effect — extended `then` shapes", () => {
  it("writes pendingChoice for `then: { recycle: 1 }` (Vision keyword)", () => {
    // Jeweled Colossus / Mystic Poro / Sai Scout / Gemcraft Seer /
    // Karma Channeler / Jhin Meticulous Killer / Divining Shells — the
    // [Vision] reminder text expands to "look at the top card of your
    // Main deck; you MAY recycle it". The parser emits this as
    // `then: { recycle: 1 }` (numeric, NOT the "rest" sentinel).
    const { ctx, draft } = buildMockCtx({ deckTop: ["vis-top"] });
    const effect: ExecutableEffect = {
      amount: 1,
      from: "deck",
      then: { recycle: 1 },
      type: "look",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(draft.pendingChoice).toBeDefined();
    expect(draft.pendingChoice?.type).toBe("look-and-pick");
    const pc = draft.pendingChoice as LookAndPickChoice;
    expect(pc.revealed).toEqual(["vis-top"]);
    // "You may recycle it" — pick = recycle, unpicked stays on top.
    expect(pc.onPicked).toBe("recycle");
    expect(pc.onUnpicked).toBe("to-top");
  });

  it("writes pendingChoice for `then: { play: true }` (Vision-play variant)", () => {
    const { ctx, draft } = buildMockCtx({ deckTop: ["play-me"] });
    const effect: ExecutableEffect = {
      amount: 1,
      from: "deck",
      then: { play: true },
      type: "look",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(draft.pendingChoice?.type).toBe("look-and-pick");
    const pc = draft.pendingChoice as LookAndPickChoice;
    expect(pc.revealed).toEqual(["play-me"]);
    expect(pc.onPicked).toBe("to-play");
    expect(pc.onUnpicked).toBe("to-top");
  });

  it("writes pendingChoice for `then: { reveal: true }` (reveal then pick)", () => {
    const { ctx, draft } = buildMockCtx({ deckTop: ["a", "b", "c"] });
    const effect: ExecutableEffect = {
      amount: 3,
      from: "deck",
      then: { reveal: true },
      type: "look",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(draft.pendingChoice?.type).toBe("look-and-pick");
    const pc = draft.pendingChoice as LookAndPickChoice;
    expect(pc.revealed).toEqual(["a", "b", "c"]);
    // Reveal-then-pick: chosen → hand, rest recycled.
    expect(pc.onPicked).toBe("to-hand");
    expect(pc.onUnpicked).toBe("recycle");
  });

  it("writes pendingChoice for `then: { draw: 1 }` (numeric draw)", () => {
    const { ctx, draft } = buildMockCtx({ deckTop: ["a", "b", "c", "d"] });
    const effect: ExecutableEffect = {
      amount: 4,
      from: "deck",
      then: { draw: 1 },
      type: "look",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(draft.pendingChoice?.type).toBe("look-and-pick");
    const pc = draft.pendingChoice as LookAndPickChoice;
    expect(pc.revealed).toEqual(["a", "b", "c", "d"]);
    expect(pc.onPicked).toBe("to-hand");
    expect(pc.onUnpicked).toBe("recycle");
  });

  it("falls through to no-op for an unrecognised `then` shape", () => {
    const { ctx, draft } = buildMockCtx({ deckTop: ["x"] });
    const effect: ExecutableEffect = {
      amount: 1,
      from: "deck",
      // No recognised key — handler should bail out without writing
      // PendingChoice rather than mishandling it.
      then: { some_future_directive: true } as unknown as { recycle: number },
      type: "look",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect(draft.pendingChoice).toBeUndefined();
  });

  it("clamps numeric recycle reveal count to deck size", () => {
    // A Vision card on an empty/short deck just reveals what's there.
    const { ctx, draft } = buildMockCtx({ deckTop: [] });
    const effect: ExecutableEffect = {
      amount: 1,
      from: "deck",
      then: { recycle: 1 },
      type: "look",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    // Deck empty → no pendingChoice (informational no-op).
    expect(draft.pendingChoice).toBeUndefined();
  });
});

describe("look → resolve end-to-end (Stacked Deck pattern)", () => {
  it("look(3) + resolve picks one to hand and recycles the other two", () => {
    const { ctx, draft, movedCalls } = buildMockCtx({
      deckTop: ["a", "b", "c", "d", "e"],
    });

    // Step 1: cast Stacked Deck — `look` writes the pendingChoice.
    executeEffect(
      {
        amount: 3,
        from: "deck",
        then: { recycle: "rest" },
        type: "look",
      } as unknown as ExecutableEffect,
      ctx,
    );
    expect(draft.pendingChoice?.type).toBe("look-and-pick");
    expect(draft.pendingChoice?.revealed).toEqual(["a", "b", "c"]);

    // Step 2: resolve — pick "b".
    const moves: { cardId: string; targetZoneId: string; position?: string }[] = [];
    const resolveCtx = {
      cards: { getCardOwner: () => "p1" },
      counters: { clearAllCounters: () => {} },
      params: { pickedCardId: "b", playerId: "p1" },
      zones: {
        moveCard: (p: { cardId: string; targetZoneId: string; position?: string }) => {
          moves.push(p);
        },
      },
    };
    // Biome-ignore lint/suspicious/noExplicitAny: reducer signature varies
    const move = pendingChoiceMoves.resolvePendingChoice as any;
    move.reducer(draft, resolveCtx);

    // "b" → hand
    expect(moves.find((m) => m.cardId === "b")?.targetZoneId).toBe("hand");
    // "a" + "c" → bottom of mainDeck
    expect(moves.find((m) => m.cardId === "a")?.targetZoneId).toBe("mainDeck");
    expect(moves.find((m) => m.cardId === "a")?.position).toBe("bottom");
    expect(moves.find((m) => m.cardId === "c")?.targetZoneId).toBe("mainDeck");
    expect(moves.find((m) => m.cardId === "c")?.position).toBe("bottom");
    // Untouched: "d", "e"
    expect(moves.find((m) => m.cardId === "d")).toBeUndefined();
    expect(moves.find((m) => m.cardId === "e")).toBeUndefined();

    // PendingChoice cleared
    expect(draft.pendingChoice).toBeUndefined();

    // MovedCalls is the look-phase mutation history — empty because
    // `look` doesn't move cards itself.
    expect(movedCalls).toEqual([]);
  });
});
