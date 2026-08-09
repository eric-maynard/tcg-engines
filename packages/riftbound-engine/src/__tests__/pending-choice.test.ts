/**
 * Pending Choice (reveal-hand) tests.
 *
 * Covers the `reveal-hand` effect, `resolvePendingChoice` move, and
 * goldfish-style auto-resolution used by Sabotage / Mindsplitter /
 * Ashe Focused.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../abilities/effect-executor";
import { executeEffect } from "../abilities/effect-executor";
import type { PendingChoice, RevealAndPickChoice, RiftboundGameState } from "../types";
import {
  isValidPendingPick,
  pendingChoiceMoves,
  pickDefaultForChoice,
} from "../game-definition/moves/pending-choice";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import {
  P1,
  P2,
  createBattlefield,
  createCard,
  createMinimalGameState,
  enumerateLegalMoves,
} from "./rules-audit/helpers";

// ---------------------------------------------------------------------------
// Mock builder — an EffectContext where hand zones and a card registry are
// Wired up so `reveal-hand` can read an opponent's hand and write a
// `pendingChoice` onto the draft.
// ---------------------------------------------------------------------------

interface MockOptions {
  playerId?: string;
  opponentId?: string;
  opponentHand?: string[];
  /** Card type per card id. Defaults to "spell" when absent. */
  cardTypes?: Record<string, "unit" | "spell" | "gear" | "equipment">;
}

function buildMockCtx(opts: MockOptions = {}): {
  ctx: EffectContext;
  draft: RiftboundGameState;
  zoneOf: Map<string, string>;
} {
  const playerId = opts.playerId ?? "p1";
  const opponentId = opts.opponentId ?? "p2";
  const opponentHand = opts.opponentHand ?? [];

  // Register card types in the global registry so the filter can distinguish
  // Units from non-units.
  const registry = getGlobalCardRegistry();
  for (const [cardId, cardType] of Object.entries(opts.cardTypes ?? {})) {
    registry.register(cardId, { cardType, id: cardId, name: cardId });
  }

  const zoneOf = new Map<string, string>();
  for (const cardId of opponentHand) {
    zoneOf.set(cardId, "hand");
  }

  const draft: RiftboundGameState = {
    battlefields: {},
    conqueredThisTurn: {},
    gameId: "pending-choice-test",
    players: {
      [playerId]: { id: playerId, victoryPoints: 0, xp: 0 },
      [opponentId]: { id: opponentId, victoryPoints: 0, xp: 0 },
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
      getCardOwner: (cardId: CoreCardId) => {
        if (opponentHand.includes(cardId as string)) {
          return opponentId;
        }
        return playerId;
      },
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
        if (zoneId === ("hand" as CoreZoneId) && pid === (opponentId as CorePlayerId)) {
          return opponentHand as unknown as CoreCardId[];
        }
        return [] as CoreCardId[];
      },
      moveCard: ({ cardId, targetZoneId }) => {
        zoneOf.set(cardId as string, targetZoneId as string);
      },
    },
  };

  return { ctx, draft, zoneOf };
}

// ---------------------------------------------------------------------------
// 1. reveal-hand effect creates a pendingChoice
// ---------------------------------------------------------------------------

describe("reveal-hand effect", () => {
  it("writes a pendingChoice with the opponent's hand snapshot", () => {
    const { ctx, draft } = buildMockCtx({
      cardTypes: { "card-a": "spell", "card-b": "unit", "card-c": "gear" },
      opponentHand: ["card-a", "card-b", "card-c"],
    });

    const effect: ExecutableEffect = {
      onPicked: "recycle",
      target: { type: "player", which: "opponent" } as unknown as ExecutableEffect["target"],
      type: "reveal-hand",
    };

    executeEffect(effect, ctx);

    expect(draft.pendingChoice).toBeDefined();
    expect(draft.pendingChoice?.type).toBe("reveal-and-pick");
    const pc = draft.pendingChoice as RevealAndPickChoice;
    expect(pc.prompter).toBe("p1");
    expect(pc.revealer).toBe("p2");
    expect(pc.revealed).toEqual(["card-a", "card-b", "card-c"]);
    expect(pc.onPicked).toBe("recycle");
  });

  it("does NOT create a pendingChoice when the filter excludes every revealed card", () => {
    const { ctx, draft } = buildMockCtx({
      cardTypes: { "u1": "unit", "u2": "unit", "u3": "unit" },
      opponentHand: ["u1", "u2", "u3"],
    });

    const effect: ExecutableEffect = {
      filter: { excludeCardTypes: ["unit"] },
      onPicked: "recycle",
      target: { type: "player", which: "opponent" } as unknown as ExecutableEffect["target"],
      type: "reveal-hand",
    };

    executeEffect(effect, ctx);

    // No valid picks → effect fizzles; leaving pendingChoice set would deadlock
    // the game (resolvePendingChoice enumerates nothing and every other move is
    // blocked by the pendingChoice check).
    expect(draft.pendingChoice).toBeUndefined();
  });

  it("stores the excludeCardTypes filter", () => {
    const { ctx, draft } = buildMockCtx({
      cardTypes: { "card-a": "spell", "card-b": "unit" },
      opponentHand: ["card-a", "card-b"],
    });

    const effect: ExecutableEffect = {
      filter: { excludeCardTypes: ["unit"] },
      onPicked: "recycle",
      target: { type: "player", which: "opponent" } as unknown as ExecutableEffect["target"],
      type: "reveal-hand",
    } as unknown as ExecutableEffect;

    executeEffect(effect, ctx);

    expect((draft.pendingChoice as RevealAndPickChoice | undefined)?.filter?.excludeCardTypes).toEqual(["unit"]);
  });

  it("does nothing when the revealer has an empty hand", () => {
    const { ctx, draft } = buildMockCtx({ opponentHand: [] });

    const effect: ExecutableEffect = {
      onPicked: "recycle",
      target: { type: "player", which: "opponent" } as unknown as ExecutableEffect["target"],
      type: "reveal-hand",
    };

    executeEffect(effect, ctx);

    expect(draft.pendingChoice).toBeUndefined();
  });

  it("defaults onPicked to recycle when omitted", () => {
    const { ctx, draft } = buildMockCtx({
      cardTypes: { "card-a": "spell" },
      opponentHand: ["card-a"],
    });

    const effect: ExecutableEffect = {
      target: { type: "player", which: "opponent" } as unknown as ExecutableEffect["target"],
      type: "reveal-hand",
    };

    executeEffect(effect, ctx);

    expect((draft.pendingChoice as RevealAndPickChoice | undefined)?.onPicked).toBe("recycle");
  });
});

// ---------------------------------------------------------------------------
// 2. Filter helpers
// ---------------------------------------------------------------------------

describe("isValidPendingPick", () => {
  let choice: PendingChoice;

  beforeEach(() => {
    const registry = getGlobalCardRegistry();
    registry.register("spell-1", { cardType: "spell", id: "spell-1", name: "Spell 1" });
    registry.register("unit-1", { cardType: "unit", id: "unit-1", name: "Unit 1" });
    registry.register("gear-1", { cardType: "gear", id: "gear-1", name: "Gear 1" });

    choice = {
      filter: { excludeCardTypes: ["unit"] },
      onPicked: "recycle",
      prompter: "p1",
      revealed: ["spell-1", "unit-1", "gear-1"],
      revealer: "p2",
      type: "reveal-and-pick",
    };
  });

  it("accepts revealed cards whose type is not excluded", () => {
    expect(isValidPendingPick(choice, "spell-1")).toBe(true);
    expect(isValidPendingPick(choice, "gear-1")).toBe(true);
  });

  it("rejects revealed cards whose type is excluded", () => {
    expect(isValidPendingPick(choice, "unit-1")).toBe(false);
  });

  it("rejects cards not in the revealed snapshot", () => {
    expect(isValidPendingPick(choice, "some-other-card")).toBe(false);
  });
});

describe("pickDefaultForChoice", () => {
  it("returns the first revealed card matching the filter", () => {
    const registry = getGlobalCardRegistry();
    registry.register("def-unit", { cardType: "unit", id: "def-unit", name: "U" });
    registry.register("def-spell", { cardType: "spell", id: "def-spell", name: "S" });

    const choice: PendingChoice = {
      filter: { excludeCardTypes: ["unit"] },
      onPicked: "recycle",
      prompter: "p1",
      revealed: ["def-unit", "def-spell"],
      revealer: "p2",
      type: "reveal-and-pick",
    };

    expect(pickDefaultForChoice(choice)).toBe("def-spell");
  });

  it("returns undefined when no revealed card passes the filter", () => {
    const registry = getGlobalCardRegistry();
    registry.register("only-unit", { cardType: "unit", id: "only-unit", name: "U" });

    const choice: PendingChoice = {
      filter: { excludeCardTypes: ["unit"] },
      onPicked: "recycle",
      prompter: "p1",
      revealed: ["only-unit"],
      revealer: "p2",
      type: "reveal-and-pick",
    };

    expect(pickDefaultForChoice(choice)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. resolvePendingChoice move
// ---------------------------------------------------------------------------

describe("resolvePendingChoice move", () => {
  const registry = getGlobalCardRegistry();

  function makeState(filterExcludeUnit: boolean): RiftboundGameState {
    registry.register("rp-spell", { cardType: "spell", id: "rp-spell", name: "RP Spell" });
    registry.register("rp-unit", { cardType: "unit", id: "rp-unit", name: "RP Unit" });
    return {
      battlefields: {},
      conqueredThisTurn: {},
      gameId: "rp-test",
      pendingChoice: {
        filter: filterExcludeUnit ? { excludeCardTypes: ["unit"] } : undefined,
        onPicked: "recycle",
        prompter: "p1",
        revealed: ["rp-spell", "rp-unit"],
        revealer: "p2",
        type: "reveal-and-pick",
      },
      players: {
        p1: { id: "p1", victoryPoints: 0, xp: 0 },
        p2: { id: "p2", victoryPoints: 0, xp: 0 },
      },
      runePools: {},
      scoredThisTurn: {},
      status: "playing",
      turn: { activePlayer: "p1", number: 1, phase: "main" },
      victoryScore: 8,
      xpGainedThisTurn: {},
    } as unknown as RiftboundGameState;
  }

  function makeContext(params: { playerId: string; pickedCardId: string }): {
    params: { playerId: string; pickedCardId: string };
    zones: { moved: { cardId: string; targetZoneId: string; position?: string }[] };
    counters: { cleared: string[] };
  } {
    const moved: { cardId: string; targetZoneId: string; position?: string }[] = [];
    const cleared: string[] = [];
    return {
      counters: { cleared },
      params,
      zones: { moved },
    } as unknown as ReturnType<typeof makeContext>;
  }

  it("condition is true for a valid pick by the prompter", () => {
    const state = makeState(true);
    const context = {
      cards: { getCardMeta: () => undefined, getCardOwner: () => "p2" },
      counters: { clearAllCounters: () => {} },
      params: { pickedCardId: "rp-spell", playerId: "p1" },
      zones: { moveCard: () => {} },
    };
    // Biome-ignore lint/suspicious/noExplicitAny: condition signature varies
    const move = pendingChoiceMoves.resolvePendingChoice as any;
    expect(move.condition(state, context)).toBe(true);
  });

  it("condition is false when the picked card is filtered out", () => {
    const state = makeState(true);
    const context = {
      cards: { getCardMeta: () => undefined, getCardOwner: () => "p2" },
      counters: { clearAllCounters: () => {} },
      params: { pickedCardId: "rp-unit", playerId: "p1" },
      zones: { moveCard: () => {} },
    };
    // Biome-ignore lint/suspicious/noExplicitAny: condition signature varies
    const move = pendingChoiceMoves.resolvePendingChoice as any;
    expect(move.condition(state, context)).toBe(false);
  });

  it("condition is false when there is no pending choice", () => {
    const state = { ...makeState(true), pendingChoice: undefined };
    const context = {
      params: { pickedCardId: "rp-spell", playerId: "p1" },
    };
    // Biome-ignore lint/suspicious/noExplicitAny: condition signature varies
    const move = pendingChoiceMoves.resolvePendingChoice as any;
    expect(move.condition(state, context)).toBe(false);
  });

  it("condition is false when a non-prompter tries to resolve", () => {
    const state = makeState(true);
    const context = { params: { pickedCardId: "rp-spell", playerId: "p2" } };
    // Biome-ignore lint/suspicious/noExplicitAny: condition signature varies
    const move = pendingChoiceMoves.resolvePendingChoice as any;
    expect(move.condition(state, context)).toBe(false);
  });

  it("enumerator returns only valid picks", () => {
    const state = makeState(true);
    const context = {
      cards: { getCardOwner: () => "p2" },
      counters: { clearAllCounters: () => {} },
      playerId: "p1",
      zones: { getCardsInZone: () => [], moveCard: () => {} },
    };
    // Biome-ignore lint/suspicious/noExplicitAny: enumerator signature varies
    const move = pendingChoiceMoves.resolvePendingChoice as any;
    const enumerated = move.enumerator(state, context);
    expect(enumerated).toEqual([{ pickedCardId: "rp-spell", playerId: "p1" }]);
  });

  it("reducer moves the picked card to the main deck (bottom) and clears pendingChoice", () => {
    const state = makeState(true);
    const moves: { cardId: string; targetZoneId: string; position?: string }[] = [];
    const context = {
      cards: { getCardOwner: () => "p2" },
      counters: { clearAllCounters: () => {} },
      params: { pickedCardId: "rp-spell", playerId: "p1" },
      zones: {
        moveCard: (p: { cardId: string; targetZoneId: string; position?: string }) => {
          moves.push(p);
        },
      },
    };
    // Biome-ignore lint/suspicious/noExplicitAny: reducer signature varies
    const move = pendingChoiceMoves.resolvePendingChoice as any;
    move.reducer(state, context);

    expect(moves).toHaveLength(1);
    expect(moves[0]?.cardId).toBe("rp-spell");
    expect(moves[0]?.targetZoneId).toBe("mainDeck");
    expect(moves[0]?.position).toBe("bottom");
    expect(state.pendingChoice).toBeUndefined();
  });

  it("reducer moves the picked card to banishment when onPicked is banish", () => {
    const state = makeState(false);
    if (state.pendingChoice) {
      (state.pendingChoice as { onPicked: RevealAndPickChoice["onPicked"] }).onPicked = "banish";
    }
    const moves: { cardId: string; targetZoneId: string }[] = [];
    const context = {
      cards: { getCardOwner: () => "p2" },
      counters: { clearAllCounters: () => {} },
      params: { pickedCardId: "rp-spell", playerId: "p1" },
      zones: {
        moveCard: (p: { cardId: string; targetZoneId: string }) => {
          moves.push(p);
        },
      },
    };
    // Biome-ignore lint/suspicious/noExplicitAny: reducer signature varies
    const move = pendingChoiceMoves.resolvePendingChoice as any;
    move.reducer(state, context);

    expect(moves[0]?.targetZoneId).toBe("banishment");
    expect(state.pendingChoice).toBeUndefined();
  });

  // rule-id: ogn-062-298-look-banish-play (Reinforce)
  it("onPicked play: banishes the pick, recycles the rest, and queues the play as a Pending Item (354.2) priced with the reduction", () => {
    registry.register("rp-big-unit", {
      cardType: "unit",
      energyCost: 7,
      id: "rp-big-unit",
      name: "RP Big Unit",
    });
    const state = makeState(false);
    (state as { runePools: unknown }).runePools = {
      p1: { energy: 4, power: {} },
    };
    (state as { pendingChoice: unknown }).pendingChoice = {
      onPicked: "play",
      onRest: "recycle",
      playEnergyReduction: 5,
      prompter: "p1",
      revealed: ["rp-spell", "rp-big-unit"],
      revealer: "p1",
      type: "reveal-and-pick",
    };
    const moves: { cardId: string; targetZoneId: string; position?: string }[] = [];
    const zoneOf = new Map<string, string>();
    const context = {
      cards: { getCardOwner: () => "p1" },
      counters: { clearAllCounters: () => {} },
      params: { pickedCardId: "rp-big-unit", playerId: "p1" },
      zones: {
        getCardZone: (id: string) => zoneOf.get(id),
        moveCard: (p: { cardId: string; targetZoneId: string; position?: string }) => {
          moves.push(p);
          zoneOf.set(p.cardId, p.targetZoneId);
        },
      },
    };
    // Biome-ignore lint/suspicious/noExplicitAny: reducer signature varies
    const move = pendingChoiceMoves.resolvePendingChoice as any;
    move.reducer(state, context);

    expect(moves[0]).toMatchObject({ cardId: "rp-big-unit", targetZoneId: "banishment" });
    expect(moves.some((m) => m.targetZoneId === "hand")).toBe(false);
    expect(moves[1]).toMatchObject({ cardId: "rp-spell", position: "bottom", targetZoneId: "mainDeck" });
    // rule 354.2 / 354.3 — the play is a Pending Item on the chain (its player's
    // location / cost dialog and the payment run when it is finalized by the
    // move wrapper, not inside the pick); the card waits in banishment (108.6.c).
    const items = state.interaction?.chain?.items ?? [];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ cardId: "rp-big-unit", controller: "p1", status: "pending", type: "permanent" });
    expect((items[0] as { play?: { costMode?: unknown } }).play?.costMode).toEqual({ energy: 5, kind: "reduce" });
    expect(zoneOf.get("rp-big-unit")).toBe("banishment");
    expect(state.runePools.p1?.energy).toBe(4);
    expect(state.pendingChoice).toBeUndefined();
  });

  it("reducer moves the picked card to trash when onPicked is discard", () => {
    const state = makeState(false);
    if (state.pendingChoice) {
      (state.pendingChoice as { onPicked: RevealAndPickChoice["onPicked"] }).onPicked = "discard";
    }
    const moves: { cardId: string; targetZoneId: string }[] = [];
    const context = {
      cards: { getCardOwner: () => "p2" },
      counters: { clearAllCounters: () => {} },
      params: { pickedCardId: "rp-unit", playerId: "p1" },
      zones: {
        moveCard: (p: { cardId: string; targetZoneId: string }) => {
          moves.push(p);
        },
      },
    };
    // Biome-ignore lint/suspicious/noExplicitAny: reducer signature varies
    const move = pendingChoiceMoves.resolvePendingChoice as any;
    move.reducer(state, context);

    expect(moves[0]?.targetZoneId).toBe("trash");
    expect(state.pendingChoice).toBeUndefined();
  });

  it("choose-destination: picking a battlefield zone id moves the card there (rule 355.2 / sfd-200-221)", () => {
    // rule-id: sfd-200-221-choose-destination-battlefield — Arcane Shift's
    // pending play offers ZONE ids (battlefield-<bfId>); the reducer must pass
    // them through verbatim, never producing battlefield-battlefield-<bfId>.
    const bfId = "player-1-bf-unl-205-219";
    const { ctx, draft, zoneOf } = buildMockCtx();
    (draft as { battlefields: Record<string, unknown> }).battlefields = {
      [bfId]: { contested: false, controller: "p1", id: bfId },
    };
    zoneOf.set("rearguard", "banishment");
    executeEffect(
      { target: "rearguard", to: "choose", type: "move" } as unknown as ExecutableEffect,
      { ...ctx, boundTargets: ["rearguard"] } as EffectContext,
    );
    expect(draft.pendingChoice?.type).toBe("choose-destination");
    const options = (draft.pendingChoice as { options: string[] }).options;
    expect(options).toContain(`battlefield-${bfId}`);

    const moves: { cardId: string; targetZoneId: string }[] = [];
    const context = {
      params: { pickedZoneId: `battlefield-${bfId}`, playerId: "p1" },
      zones: {
        moveCard: (p: { cardId: string; targetZoneId: string }) => {
          moves.push(p);
        },
      },
    };
    // Biome-ignore lint/suspicious/noExplicitAny: reducer signature varies
    const move = pendingChoiceMoves.resolvePendingChoice as any;
    expect(move.condition(draft, context)).toBe(true);
    move.reducer(draft, context);
    expect(moves).toEqual([{ cardId: "rearguard", targetZoneId: `battlefield-${bfId}` }]);
    expect(draft.pendingChoice).toBeUndefined();
  });

  it("choose-destination from banishment offers only base + CONTROLLED battlefields (sfd-200-221)", () => {
    // rule-id: sfd-200-221 — a pending "play it" may not place the unit at
    // an uncontrolled/enemy battlefield.
    const mine = "player-1-bf-unl-205-219";
    const theirs = "player-2-bf-ogn-277-298";
    const { ctx, draft, zoneOf } = buildMockCtx();
    (draft as { battlefields: Record<string, unknown> }).battlefields = {
      [mine]: { contested: false, controller: "p1", id: mine },
      [theirs]: { contested: false, controller: "p2", id: theirs },
    };
    zoneOf.set("rearguard", "banishment");
    executeEffect(
      { target: "rearguard", to: "choose", type: "move" } as unknown as ExecutableEffect,
      { ...ctx, boundTargets: ["rearguard"] } as EffectContext,
    );
    const options = (draft.pendingChoice as { options: string[] }).options;
    expect(options).toEqual(["base", `battlefield-${mine}`]);
  });

  it("sequence routes [lead, second] play-time targets to their own steps and never to 'self' (sfd-200-221)", () => {
    // rule-id: sfd-200-221 — Arcane Shift: banish FRIENDLY, play it, deal 3
    // to the ENEMY, banish THIS. Bound [friendly, enemy] must not banish both
    // nor damage the friendly, and "Banish this" hits the spell itself.
    const { ctx, draft, zoneOf } = buildMockCtx({
      cardTypes: { enemy: "unit", friendly: "unit" },
      opponentHand: [],
    });
    zoneOf.set("friendly", "battlefield-bf1");
    zoneOf.set("enemy", "battlefield-bf1");
    zoneOf.set("source-spell", "chain");
    const damaged: Record<string, number> = {};
    const seqCtx = {
      ...ctx,
      boundTargets: ["friendly", "enemy"],
      counters: {
        ...ctx.counters,
        addCounter: (id: CoreCardId, c: string, n: number) => {
          if (c === "damage") damaged[id as string] = (damaged[id as string] ?? 0) + n;
        },
      },
    } as EffectContext;
    executeEffect(
      {
        effects: [
          { target: { controller: "friendly", type: "unit" }, type: "banish" },
          {
            effects: [
              { ignoreCost: true, target: { type: "pending-value" }, type: "play" },
              {
                amount: 3,
                target: { controller: "enemy", location: "battlefield", type: "unit" },
                type: "damage",
              },
              { target: "self", type: "banish" },
            ],
            type: "sequence",
          },
        ],
        pendingValue: { source: 0 },
        type: "sequence",
      } as unknown as ExecutableEffect,
      seqCtx,
    );
    expect(zoneOf.get("friendly")).toBe("banishment");
    expect(zoneOf.get("enemy")).toBe("battlefield-bf1");
    expect(damaged).toEqual({ enemy: 3 });
    expect(zoneOf.get("source-spell")).toBe("banishment");
    const items = draft.interaction?.chain?.items ?? [];
    expect(items.map((i: { cardId?: string }) => i.cardId)).toEqual(["friendly"]);
  });

  it("recycle position:owner-choice prompts the OWNER for top/bottom of Main Deck (unl-204-219)", () => {
    // rule-id: unl-204-219-owner-chooses-top-or-bottom
    const { ctx, draft } = buildMockCtx({ opponentHand: ["enemy-unit"] });
    executeEffect(
      { position: "owner-choice", type: "recycle" } as unknown as ExecutableEffect,
      { ...ctx, boundTargets: ["enemy-unit"] } as EffectContext,
    );
    expect(draft.pendingChoice?.type).toBe("choose-destination");
    const pc = draft.pendingChoice as { playerId: string; cardId: string; options: string[] };
    expect(pc.playerId).toBe("p2");
    expect(pc.cardId).toBe("enemy-unit");
    expect(pc.options).toEqual(["mainDeck-top", "mainDeck-bottom"]);

    const moves: { cardId: string; targetZoneId: string; position?: string }[] = [];
    const context = {
      counters: { clearAllCounters: () => {} },
      params: { pickedZoneId: "mainDeck-top", playerId: "p2" },
      zones: {
        moveCard: (p: { cardId: string; targetZoneId: string; position?: string }) => {
          moves.push(p);
        },
      },
    };
    // Biome-ignore lint/suspicious/noExplicitAny: reducer signature varies
    const move = pendingChoiceMoves.resolvePendingChoice as any;
    expect(move.condition(draft, { params: { pickedZoneId: "mainDeck-top", playerId: "p1" } })).toBe(
      false,
    );
    expect(move.condition(draft, context)).toBe(true);
    move.reducer(draft, context);
    expect(moves).toEqual([{ cardId: "enemy-unit", position: "top", targetZoneId: "mainDeck" }]);
    expect(draft.pendingChoice).toBeUndefined();
  });

  it("created-token choose-destination places without a move and advances the queue (ogs-015-024)", () => {
    // rule-id: ogs-015-024 (rule 439.2.b.1)
    const { draft } = buildMockCtx({ opponentHand: [] });
    (draft as { pendingChoice?: unknown }).pendingChoice = {
      cardId: "tok-0",
      created: true,
      options: ["base", "battlefield-bf1"],
      playerId: "p1",
      queue: ["tok-1"],
      type: "choose-destination",
    };
    const moves: { cardId: string; targetZoneId: string }[] = [];
    const zoneOf = new Map<string, string>([
      ["tok-0", "base"],
      ["tok-1", "base"],
    ]);
    const context = {
      counters: { clearAllCounters: () => {} },
      params: { pickedZoneId: "battlefield-bf1", playerId: "p1" },
      zones: {
        getCardZone: (id: string) => zoneOf.get(id),
        moveCard: (p: { cardId: string; targetZoneId: string }) => {
          moves.push(p);
          zoneOf.set(p.cardId, p.targetZoneId);
        },
      },
    };
    // Biome-ignore lint/suspicious/noExplicitAny: reducer signature varies
    const move = pendingChoiceMoves.resolvePendingChoice as any;
    move.reducer(draft, context);
    expect(moves).toEqual([{ cardId: "tok-0", targetZoneId: "battlefield-bf1" }]);
    expect(draft.pendingChoice).toMatchObject({ cardId: "tok-1", queue: [], type: "choose-destination" });
    move.reducer(draft, { ...context, params: { pickedZoneId: "base", playerId: "p1" } });
    // Picking base for a token already minted there is not a zone change.
    expect(moves).toHaveLength(1);
    expect(draft.pendingChoice).toBeUndefined();
  });

  it("reducer is a no-op when the pick is invalid", () => {
    const state = makeState(true);
    const moves: { cardId: string; targetZoneId: string }[] = [];
    const context = {
      cards: { getCardOwner: () => "p2" },
      counters: { clearAllCounters: () => {} },
      params: { pickedCardId: "rp-unit", playerId: "p1" },
      zones: {
        moveCard: (p: { cardId: string; targetZoneId: string }) => {
          moves.push(p);
        },
      },
    };
    // Biome-ignore lint/suspicious/noExplicitAny: reducer signature varies
    const move = pendingChoiceMoves.resolvePendingChoice as any;
    move.reducer(state, context);

    expect(moves).toHaveLength(0);
    expect(state.pendingChoice).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Rule 762 name-card effect (Fallen Feline)
// ---------------------------------------------------------------------------

describe("name-card effect (rule 762)", () => {
  it("prompts the controller to name a spell and records it on the source card", () => {
    const registry = getGlobalCardRegistry();
    registry.register("nc-spell-a", { cardType: "spell", id: "nc-spell-a", name: "Bolt" });
    registry.register("nc-spell-b", { cardType: "spell", id: "nc-spell-b", name: "Zap" });
    registry.register("nc-unit", { cardType: "unit", id: "nc-unit", name: "Grunt" });

    const { ctx, draft } = buildMockCtx({});

    executeEffect({ type: "name-card", cardType: "spell" } as unknown as ExecutableEffect, ctx);

    expect(draft.pendingChoice?.type).toBe("name-card");
    const pc = draft.pendingChoice as Extract<PendingChoice, { type: "name-card" }>;
    expect(pc.prompter).toBe("p1");
    expect(pc.sourceCardId).toBe("source-spell");
    expect(pc.options).toContain("Bolt");
    expect(pc.options).toContain("Zap");
    expect(pc.options).not.toContain("Grunt");

    // Biome-ignore lint/suspicious/noExplicitAny: enumerator/reducer signatures vary
    const move = pendingChoiceMoves.resolvePendingChoice as any;
    const enumerated = move.enumerator(draft, { playerId: "p1" });
    expect(enumerated).toContainEqual({ pickedName: "Bolt", playerId: "p1" });

    const meta: Record<string, unknown> = {};
    const context = {
      cards: { updateCardMeta: (_id: string, m: Record<string, unknown>) => Object.assign(meta, m) },
      params: { pickedName: "Bolt", playerId: "p1" },
    };
    move.reducer(draft, context);
    expect(meta.namedCard).toBe("Bolt");
    expect(draft.pendingChoice).toBeUndefined();
  });
});

describe("two-slot sequence spell targeting (sfd-200-221)", () => {
  it("playSpell enumerates [friendly, enemy] target pairs for a two-slot sequence spell (sfd-200-221)", () => {
    // rule-id: sfd-200-221 (rule 355.8) — both caster-chosen targets are
    // locked at play time.
    const engine = createMinimalGameState({ phase: "main", currentPlayer: P1 });
    createBattlefield(engine, "as-bf", { controller: P1 });
    createCard(engine, "as-friendly", {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "battlefield-as-bf",
    });
    createCard(engine, "as-enemy", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-as-bf" });
    createCard(engine, "as-spell", {
      abilities: [
        {
          effect: {
            effects: [
              { target: { controller: "friendly", type: "unit" }, type: "banish" },
              {
                effects: [
                  { ignoreCost: true, target: { type: "pending-value" }, type: "play" },
                  {
                    amount: 3,
                    target: { controller: "enemy", location: "battlefield", type: "unit" },
                    type: "damage",
                  },
                  { target: "self", type: "banish" },
                ],
                type: "sequence",
              },
            ],
            pendingValue: { source: 0 },
            type: "sequence",
          },
          timing: "action",
          type: "spell",
        },
      ] as unknown as [],
      cardType: "spell",
      energyCost: 0,
      owner: P1,
      timing: "action",
      zone: "hand",
    });
    const plays = enumerateLegalMoves(engine, P1).filter(
      (m) => m.moveId === "playSpell" && (m.params as { cardId?: string }).cardId === "as-spell",
    );
    expect(plays.map((m) => (m.params as { targets?: string[] }).targets)).toEqual([
      ["as-friendly", "as-enemy"],
    ]);
  });
});

// ---------------------------------------------------------------------------
// 5. Regression: pendingChoice gates every other move
// ---------------------------------------------------------------------------

describe("pendingChoice gates every discretionary move", () => {
  it("enumerateMoves returns ONLY resolvePendingChoice + concede while a choice is pending", () => {
    const engine = createMinimalGameState({ phase: "main", currentPlayer: P1 });

    // Board state that would otherwise enumerate resource / movement / combat
    // moves for P1: a battlefield with a friendly unit, a ready base unit, and
    // a ready rune in the pool.
    createBattlefield(engine, "bf-gate", { controller: null });
    createCard(engine, "gate-unit-base", { cardType: "unit", might: 2, owner: P1, zone: "base" });
    createCard(engine, "gate-unit-bf", {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "battlefield-bf-gate",
    });
    createCard(engine, "gate-rune", {
      cardType: "rune",
      domain: "fire",
      owner: P1,
      zone: "runePool",
    });
    createCard(engine, "gate-hand-spell", { cardType: "spell", owner: P2, zone: "hand" });

    // Sanity: without a pending choice these board pieces DO enumerate other
    // moves (guards against the test passing only because the board is empty).
    const before = new Set(enumerateLegalMoves(engine, P1).map((m) => m.moveId));
    expect(before.has("resolvePendingChoice")).toBe(false);
    expect(before.size).toBeGreaterThan(2);

    // Install a pending choice directly on the engine's state.
    const internal = engine as unknown as { currentState: RiftboundGameState };
    const patched = structuredClone(internal.currentState) as RiftboundGameState;
    patched.pendingChoice = {
      onPicked: "discard",
      prompter: P1,
      revealed: ["gate-hand-spell"],
      revealer: P2,
      type: "reveal-and-pick",
    };
    internal.currentState = patched;
    engine.getFlowManager()?.syncState(patched);

    const moves = enumerateLegalMoves(engine, P1);
    const moveIds = new Set(moves.map((m) => m.moveId));

    expect(moveIds.has("resolvePendingChoice")).toBe(true);
    expect(moveIds.has("concede")).toBe(true);
    for (const id of moveIds) {
      expect(["resolvePendingChoice", "concede"]).toContain(id);
    }
  });
});
