/**
 * Ruling 9cf5bdc29c3cebf5 — (deck construction) a mirror match with identical decks.
 *   Built through a real duel setup with the SAME DeckConfig on both seats: Wuju Master (UNL-191) as the
 *   Legend, Master Yi, Tempered (UNL-113) as the Champion, one battlefield (OGN-277) and 40 identical
 *   main-deck cards each.
 *
 * Q: In a mirror match, may both players use the same legend and champion unit, or must they differ?
 * A: There is no such restriction. Champion, Legend, battlefields — even the whole decklist — may be
 *    identical between opponents; deck construction is per player.
 * Rules: 103 / 483 (deck construction is a per-player list; nothing references the opponent's choices),
 *        485 (duel setup), 108 / 110 (each player's own Legend and Champion zones).
 */
import { describe, expect, test } from "bun:test";
import { Game, P1, P2 } from "../../../harness";

const WUJU_MASTER = "unl-191-219";
const MASTER_YI_TEMPERED = "unl-113-219";

/** One deck object, handed to BOTH seats. */
const DECK = {
  battlefieldIds: ["ogn-277-298"],
  championId: MASTER_YI_TEMPERED,
  legendId: WUJU_MASTER,
  mainDeckCardIds: Array.from({ length: 40 }, () => "ogn-175-298"),
  runeDeckCardIds: Array.from({ length: 12 }, () => "ogn-007-298"),
};

describe("Ruling 9cf5bdc29c3cebf5 — identical legends, champions and decklists on both sides are legal", () => {
  test("the duel starts with the same Legend in both Legend Zones — two separate objects, one printed card", async () => {
    const game = await Game.fromDecks({ p1: DECK, p2: DECK });
    await game.settle();
    const l1 = game.p1.legend();
    const l2 = game.p2.legend();
    expect(l1).toBeDefined();
    expect(l2).toBeDefined();
    expect(l1).not.toBe(l2); // distinct instances …
    expect(game.state(l1!).defId).toBe(WUJU_MASTER); // … of the same card
    expect(game.state(l2!).defId).toBe(WUJU_MASTER);
    expect(game.state(l1!).owner).toBe(P1);
    expect(game.state(l2!).owner).toBe(P2);
  });

  test("the same is true of the chosen Champion", async () => {
    const game = await Game.fromDecks({ p1: DECK, p2: DECK });
    await game.settle();
    const c1 = game.p1.champion();
    const c2 = game.p2.champion();
    expect(game.state(c1!)).toMatchObject({ defId: MASTER_YI_TEMPERED, owner: P1 });
    expect(game.state(c2!)).toMatchObject({ defId: MASTER_YI_TEMPERED, owner: P2 });
    expect(game.state(c1!).name).toBe(game.state(c2!).name);
  });

  test("identical battlefields and identical main decks are fine too, and the mirror game plays on normally", async () => {
    const game = await Game.fromDecks({ p1: DECK, p2: DECK });
    await game.settle();
    expect(game.battlefields()).toHaveLength(2); // one from each identical deck
    expect(game.p1.hand()).toHaveLength(5);
    expect(game.p2.hand()).toHaveLength(4);
    expect(game.isOver()).toBe(false);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
