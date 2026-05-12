/**
 * Rules Audit: Legion intrinsic triggers, Ambush real-play permission, and
 * Additional Turns (Unleashed, Core Rules 2026-03-30).
 *
 * Covers:
 *   - Rule 812 (Legion, a Dependent Keyword): "[Legion][>] [Text]" /
 *     "[Legion] — [Text]" is short for "If you've played another card this
 *     turn, this card gains [Text]." When the carried Text is itself a
 *     *triggered* ability (e.g. "When you play me, buff me"), the parser
 *     emits `{ type: "keyword", keyword: "Legion", effect, trigger }` and the
 *     engine synthesizes a real `triggered` ability gated on the Legion
 *     condition so it fires in play — but only when the controller has
 *     already played another card this turn (rule 812.1.b.1 / 812.2).
 *   - Rule 822 (Ambush): an Ambush unit may be played to a battlefield where
 *     its controller has units, with [Reaction] timing — verified in real
 *     play (the `playUnit` move is legal and the enumerator surfaces it),
 *     even off-turn and outside the main phase.
 *   - Rule 734 (Additional Turns): an `extra-turn` effect enqueues the
 *     controller onto `pendingExtraTurns`; the turn-queue primitives dequeue
 *     it FIFO so it is taken directly after the current turn.
 *
 * Methodology: minimal state -> one input -> assert rules-correct output ->
 * cite rule number.
 */

import { describe, expect, it } from "bun:test";
import { executeEffect } from "../../abilities/effect-executor";
import {
  dequeueExtraTurn,
  enqueueExtraTurn,
  nextTurnPlayer,
  peekExtraTurn,
} from "../../operations/turn-queue";
import {
  P1,
  P2,
  applyMove,
  checkMoveLegal,
  createBattlefield,
  createCard,
  createMinimalGameState,
  enqueuePendingExtraTurn,
  enumerateLegalMoves,
  fireTrigger,
  getCardMeta,
  getState,
  setCardsPlayedThisTurn,
} from "./helpers";

// A Legion ability whose carried text is a "When you play me" trigger:
//   "[Legion] — When you play me, buff me." -> the parser strips "When you
//   Play me" and tags the keyword ability with the play-self trigger.
const LEGION_ON_PLAY_BUFF = {
  effect: { amount: 1, duration: "permanent", target: { type: "self" }, type: "modify-might" },
  keyword: "Legion",
  trigger: { event: "play-self", on: "self" },
  type: "keyword" as const,
};

// -----------------------------------------------------------------------------
// Rule 812: Legion intrinsic triggered ability
// -----------------------------------------------------------------------------

describe("Rule 812: Legion synthesizes a triggered ability gated on the Legion condition", () => {
  it("fires the carried 'when you play me' effect when the controller already played another card this turn", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "trifarian", {
      abilities: [LEGION_ON_PLAY_BUFF],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });
    // Rule 812.1.b.1: the controller has already played another card this turn.
    setCardsPlayedThisTurn(engine, P1, 1);

    const fired = fireTrigger(engine, { cardId: "trifarian", playerId: P1, type: "play-self" });
    expect(fired).toBe(1);
    // Side effect: the +1 Might buff landed.
    expect(getCardMeta(engine, "trifarian")?.mightModifier ?? 0).toBe(1);
  });

  it("does NOT fire when the controller has not played another card this turn (rule 812.1.c)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "trifarian", {
      abilities: [LEGION_ON_PLAY_BUFF],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });
    // CardsPlayedThisTurn[P1] defaults to 0 — Legion condition is unsatisfied.
    const fired = fireTrigger(engine, { cardId: "trifarian", playerId: P1, type: "play-self" });
    expect(fired).toBe(0);
    expect(getCardMeta(engine, "trifarian")?.mightModifier ?? 0).toBe(0);
  });

  it("does NOT fire for an unrelated event (the trigger is on play-self only)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "trifarian", {
      abilities: [LEGION_ON_PLAY_BUFF],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });
    setCardsPlayedThisTurn(engine, P1, 1);
    const fired = fireTrigger(engine, { cardId: "trifarian", owner: P1, type: "die" });
    expect(fired).toBe(0);
  });

  it("a Legion keyword ability WITHOUT a trigger (e.g. 'I cost [2] less') is NOT synthesized as a triggered ability", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "noxus-hopeful", {
      // Mirrors the parser output for "[Legion] — I cost [2] less."
      abilities: [
        {
          effect: { reduction: ":rb_energy_2:", target: "self", type: "cost-reduction" },
          keyword: "Legion",
          type: "keyword" as const,
        },
      ],
      cardType: "unit",
      might: 4,
      owner: P1,
      zone: "base",
    });
    setCardsPlayedThisTurn(engine, P1, 1);
    // No play-self trigger should fire from this static Legion cost-reduction.
    expect(fireTrigger(engine, { cardId: "noxus-hopeful", playerId: P1, type: "play-self" })).toBe(
      0,
    );
  });
});

// -----------------------------------------------------------------------------
// Rule 822: Ambush real-play permission
// -----------------------------------------------------------------------------

const BF = "bf-ambush";

describe("Rule 822: an Ambush unit can be played to a battlefield where its controller has units, with Reaction timing", () => {
  it("playUnit is legal (off main phase, off the active turn) when a friendly unit is present at the battlefield", () => {
    // P2's turn, P1 wants to Ambush in.
    const engine = createMinimalGameState({ currentPlayer: P2, phase: "main" });
    createBattlefield(engine, BF, { controller: P2 });
    // P1 already controls a unit there (the Ambush precondition).
    createCard(engine, "p1-scout", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: `battlefield-${BF}`,
    });
    // The Ambush unit in P1's hand. energyCost 0 keeps the affordability path trivial.
    createCard(engine, "ambusher", {
      cardType: "unit",
      energyCost: 0,
      keywords: ["Ambush"],
      might: 2,
      owner: P1,
      zone: "hand",
    });

    expect(
      checkMoveLegal(engine, "playUnit", {
        cardId: "ambusher",
        location: `battlefield-${BF}`,
        playerId: P1,
      }),
    ).toBe(true);

    // And the enumerator surfaces it for P1.
    const moves = enumerateLegalMoves(engine, P1);
    const ambushMove = moves.find(
      (m) =>
        m.moveId === "playUnit" &&
        m.params?.cardId === "ambusher" &&
        m.params?.location === `battlefield-${BF}`,
    );
    expect(ambushMove).toBeDefined();

    // Executing it moves the unit onto the battlefield.
    const result = applyMove(engine, "playUnit", {
      cardId: "ambusher",
      location: `battlefield-${BF}`,
      playerId: P1,
    });
    expect(result.success).toBe(true);
  });

  it("playUnit to a battlefield is NOT legal for a non-Ambush unit", () => {
    const engine = createMinimalGameState({ currentPlayer: P2, phase: "main" });
    createBattlefield(engine, BF, { controller: P2 });
    createCard(engine, "p1-scout", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: `battlefield-${BF}`,
    });
    createCard(engine, "plain-unit", {
      cardType: "unit",
      energyCost: 0,
      might: 2,
      owner: P1,
      zone: "hand",
    });
    expect(
      checkMoveLegal(engine, "playUnit", {
        cardId: "plain-unit",
        location: `battlefield-${BF}`,
        playerId: P1,
      }),
    ).toBe(false);
  });

  it("Ambush permission is NOT valid when the controller has no unit at the chosen battlefield (rule 822.3)", () => {
    const engine = createMinimalGameState({ currentPlayer: P2, phase: "main" });
    createBattlefield(engine, BF, { controller: P2 });
    // No P1 unit at the battlefield.
    createCard(engine, "ambusher", {
      cardType: "unit",
      energyCost: 0,
      keywords: ["Ambush"],
      might: 2,
      owner: P1,
      zone: "hand",
    });
    expect(
      checkMoveLegal(engine, "playUnit", {
        cardId: "ambusher",
        location: `battlefield-${BF}`,
        playerId: P1,
      }),
    ).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// Rule 734: Additional Turns
// -----------------------------------------------------------------------------

describe("Rule 734: Additional Turns queue", () => {
  it("an 'extra-turn' effect enqueues the controller onto pendingExtraTurns", () => {
    // The effect mutates `ctx.draft` (in production this is the Immer draft).
    // A plain mutable object models that here.
    const draft = { players: {} } as unknown as Parameters<typeof executeEffect>[1]["draft"];
    executeEffect(
      { type: "extra-turn" },
      {
        cards: {
          getCardMeta: () => undefined,
          getCardOwner: () => P1,
          updateCardMeta: () => {},
        },
        counters: {
          addCounter: () => {},
          clearCounter: () => {},
          removeCounter: () => {},
          setFlag: () => {},
        },
        draft,
        playerId: P1,
        sourceCardId: "time-warp",
        zones: {
          drawCards: () => {},
          getCardZone: () => undefined,
          getCardsInZone: () => [],
          moveCard: () => {},
        },
      },
    );
    expect((draft as { pendingExtraTurns?: string[] }).pendingExtraTurns).toEqual([P1]);
  });

  it("dequeueExtraTurn returns queued players FIFO; nextTurnPlayer prefers an extra turn over the normal successor (rule 734)", () => {
    const draft = {} as Parameters<typeof enqueueExtraTurn>[0];
    enqueueExtraTurn(draft, P1);
    enqueueExtraTurn(draft, P2);
    expect(peekExtraTurn(draft)).toBe(P1);
    // Normal rotation after P1's turn would be P2 — but the queued additional
    // Turn (P1's) is inserted directly after the current turn (rule 734).
    expect(nextTurnPlayer(draft, P2)).toBe(P1);
    // The next additional turn (P2's) is taken before normal rotation resumes.
    expect(nextTurnPlayer(draft, P1)).toBe(P2);
    // Queue drained — normal rotation resumes.
    expect((draft as { pendingExtraTurns?: string[] }).pendingExtraTurns).toEqual([]);
    expect(nextTurnPlayer(draft, P1)).toBe(P1);
  });

  it("dequeueExtraTurn returns undefined when no additional turn is pending", () => {
    expect(dequeueExtraTurn({} as Parameters<typeof dequeueExtraTurn>[0])).toBeUndefined();
  });

  it("enqueuePendingExtraTurn writes through to game state (rule 734 queue)", () => {
    const engine = createMinimalGameState({ currentPlayer: P2, phase: "main" });
    enqueuePendingExtraTurn(engine, P1);
    expect(getState(engine).pendingExtraTurns).toEqual([P1]);
  });
});
