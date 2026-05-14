/**
 * Phase B batch 12 - monkey-rescan finding R-2: initializeMainDeck /
 * initializeRuneDeck must register card ownership.
 *
 * Discovered by the random-monkey harness while extending its card pool.
 * After registering card definitions for the synthetic deck IDs the
 * monkey uses, the legal-move enumerator STILL never produced any play
 * moves. Tracing showed:
 *
 *   1. The mainDeck zone's `cardIds` array correctly contained all 40
 *      cards after `initializeMainDeck`.
 *   2. But `state.cards[cardId]` was undefined for every card — no
 *      ownership / controller / zone info had been registered.
 *   3. `drawInitialHand` calls `zones.drawCards({ from: "mainDeck",
 *      playerId, count: 4 })`, which internally calls
 *      `getCardsInZone(zone, playerId)` — that filter walks
 *      `state.cards[cardId].owner === playerId`. Cards with undefined
 *      owner DON'T match → the filtered list is empty → drawCards
 *      moves nothing.
 *   4. `drawInitialHand` returned `success: true` regardless — a silent
 *      no-op that left every player with an empty hand. The whole game
 *      then had no playable cards.
 *
 * Root cause: `initializeMainDeck` and `initializeRuneDeck` used
 * `zones.moveCard({ cardId, targetZoneId })`. `moveCard` doesn't create
 * `state.cards[cardId]` if it doesn't exist — it pushes the ID into the
 * zone's `cardIds` array, then silently skips the card metadata update
 * (`if (state.cards[cardId])` is false). The riftbound setup never
 * called `createCardInZone` / `createDeck`, so cards had no owner.
 *
 * Fix: both reducers now use `zones.createCardInZone({ cardId,
 * definitionId, zoneId, ownerId, controllerId, position })` so each
 * card is registered with owner = the player who's bringing the deck.
 *
 * Generic, no per-card ifs.
 */

import { describe, expect, test } from "bun:test";
import { RuleEngine } from "@tcg/core";
import type { PlayerId } from "@tcg/core";
import { riftboundDefinition } from "../../game-definition/definition";
import type {
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "../../types";

const P1 = "player-1";
const P2 = "player-2";

function createEngine() {
  return new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
    riftboundDefinition,
    [
      { id: P1, name: "P1" },
      { id: P2, name: "P2" },
    ],
    { seed: "monkey-b12-init-deck" },
  );
}

function getInternalCards(
  engine: RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>,
): Record<string, { owner?: string; zone?: string; controller?: string }> {
  return (
    engine as unknown as {
      internalState: {
        cards: Record<string, { owner?: string; zone?: string; controller?: string }>;
      };
    }
  ).internalState.cards;
}

describe("monkey-b12 finding R-2: deck init registers card ownership", () => {
  test("initializeMainDeck creates state.cards entries with the correct owner", () => {
    const engine = createEngine();

    engine.executeMove("initializeMainDeck", {
      params: {
        cardIds: Array.from({ length: 40 }, (_, i) => `${P1}-card-${i}`),
        playerId: P1,
      },
      playerId: P1 as PlayerId,
    });

    const cards = getInternalCards(engine);
    // Every dealt cardId should have a state.cards entry owned by P1
    // And living in the mainDeck zone.
    for (let i = 0; i < 40; i++) {
      const id = `${P1}-card-${i}`;
      expect(cards[id]).toBeDefined();
      expect(cards[id]?.owner).toBe(P1);
      expect(cards[id]?.zone).toBe("mainDeck");
    }
  });

  test("initializeRuneDeck creates state.cards entries with the correct owner", () => {
    const engine = createEngine();

    engine.executeMove("initializeRuneDeck", {
      params: {
        playerId: P1,
        runeIds: Array.from({ length: 12 }, (_, i) => `${P1}-rune-${i}`),
      },
      playerId: P1 as PlayerId,
    });

    const cards = getInternalCards(engine);
    for (let i = 0; i < 12; i++) {
      const id = `${P1}-rune-${i}`;
      expect(cards[id]).toBeDefined();
      expect(cards[id]?.owner).toBe(P1);
      expect(cards[id]?.zone).toBe("runeDeck");
    }
  });

  test("drawInitialHand actually moves 4 cards into hand (no silent no-op)", () => {
    const engine = createEngine();

    for (const pid of [P1, P2]) {
      engine.executeMove("initializeMainDeck", {
        params: {
          cardIds: Array.from({ length: 40 }, (_, i) => `${pid}-card-${i}`),
          playerId: pid,
        },
        playerId: pid as PlayerId,
      });
    }

    engine.executeMove("drawInitialHand", {
      params: { playerId: P1 },
      playerId: P1 as PlayerId,
    });

    const cards = getInternalCards(engine);
    const handCardsForP1 = Object.entries(cards).filter(
      ([, c]) => c.zone === "hand" && c.owner === P1,
    );
    // Rule 116: starting hand is 4 cards.
    expect(handCardsForP1.length).toBe(4);

    // And the cards remaining in mainDeck should be P1's 40 - 4 = 36.
    const deckCardsForP1 = Object.entries(cards).filter(
      ([, c]) => c.zone === "mainDeck" && c.owner === P1,
    );
    expect(deckCardsForP1.length).toBe(36);
  });

  test("two players' decks don't bleed across owners (filter by playerId is honored)", () => {
    const engine = createEngine();

    for (const pid of [P1, P2]) {
      engine.executeMove("initializeMainDeck", {
        params: {
          cardIds: Array.from({ length: 40 }, (_, i) => `${pid}-card-${i}`),
          playerId: pid,
        },
        playerId: pid as PlayerId,
      });
    }

    const cards = getInternalCards(engine);
    const p1Deck = Object.entries(cards).filter(
      ([, c]) => c.zone === "mainDeck" && c.owner === P1,
    );
    const p2Deck = Object.entries(cards).filter(
      ([, c]) => c.zone === "mainDeck" && c.owner === P2,
    );
    expect(p1Deck.length).toBe(40);
    expect(p2Deck.length).toBe(40);
  });
});
