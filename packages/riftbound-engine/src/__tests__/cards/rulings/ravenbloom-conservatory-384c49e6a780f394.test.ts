/**
 * Ruling 384c49e6a780f394 — Ravenbloom Conservatory (SFD-215 → sfd-215-221) · Battlefield
 *   "When you defend here, reveal the top card of your Main Deck. If it's a spell, put it in your hand.
 *    Otherwise, recycle it."
 *
 * Q: Does the Conservatory FORCE me to recycle the revealed card when it is not a spell?
 * A: Yes. "Otherwise, recycle it" is mandatory — the card does not say "you may recycle". A revealed
 *    Unit or Gear must go to the bottom of your Main Deck; there is no option to leave it on top.
 * Rules: 403.2.a (a player must Recycle when instructed by a game effect), 403.1.a (recycle = to the
 *        bottom of the deck), 359.3 (a resolving instruction without "may" is not optional).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RAVENBLOOM = "sfd-215-221";
const SKULKER = "ogn-175-298"; // vanilla unit — NOT a spell
const GARBAGE_GRABBER = "ogn-099-298"; // gear — NOT a spell
const STUPEFY = "ogn-095-298"; // a spell

/** P2's turn. P1 holds the live Conservatory with a 5-Might Warden; P2 attacks it with a 2-Might Raider. */
function board(deckTop: string) {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("rb", { controller: P1, def: RAVENBLOOM, inert: false, owner: P1 })
    .unit(P1, "rb", { might: 5, name: "Warden" }, "warden")
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
    .deck(P1, [deckTop, SKULKER], ["top", "next"]);
}

/** P2 attacks the Conservatory; stop with P1's defend trigger on the chain. */
async function attacked(deckTop: string): Promise<Game> {
  const game = await board(deckTop).build();
  await game.p2.move("raider", "rb");
  expect(game.state("warden").combatRole).toBe("defender");
  return game;
}

describe("Ruling 384c49e6a780f394 — Ravenbloom Conservatory's 'Otherwise, recycle it' is mandatory", () => {
  test("defending puts the Conservatory's reveal trigger on the chain (the deck is untouched until it resolves)", async () => {
    const game = await attacked(SKULKER);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rb", controller: P1, triggered: true })]);
    expect(game.p1.deck()[0]).toBe("top");
    expect(game.p1.hand()).toEqual([]);
  });

  test("ruling: a revealed UNIT is recycled — it leaves the top of the deck, never reaches the hand, and P1 is given no choice about it", async () => {
    const game = await attacked(SKULKER);
    await game.p1.passPriority();
    await game.p2.passPriority();
    // Mandatory: no yes/no and no pick is raised for the recycle.
    expect(["yes-no", "pick"]).not.toContain(game.decision()?.kind);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("next"); // "top" is no longer the top card …
    expect(game.p1.deck().at(-1)).toBe("top"); // … it went to the bottom (403.1.a)
    expect(game.zoneOf("top")).toBe("mainDeck"); // recycled, not trashed or banished
  });

  test("a revealed GEAR is recycled for the same reason (only spells are kept)", async () => {
    const game = await attacked(GARBAGE_GRABBER);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck().at(-1)).toBe("top");
    expect(game.zoneOf("top")).toBe("mainDeck");
  });

  test("contrast — a revealed SPELL goes to P1's hand instead and is not recycled", async () => {
    const game = await attacked(STUPEFY);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toEqual(["top"]);
    expect(game.zoneOf("top")).toBe("hand");
    expect(game.p1.deck()[0]).toBe("next");
  });

  test("the whole thing settles into an ordinary combat afterwards (the Warden holds the Conservatory)", async () => {
    const game = await attacked(SKULKER);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.rb?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
