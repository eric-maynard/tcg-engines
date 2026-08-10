/**
 * Ruling 2c1317730ef2669e — Ravenbloom Conservatory (SFD-215 → sfd-215-221) · Battlefield
 *   "When you defend here, reveal the top card of your Main Deck. If it's a spell, put it in your hand. Otherwise, recycle it."
 *   × Anivia, Primal (OGN-148 → ogn-148-298) · Unit · 8 Might · "When I attack, deal 3 to all enemy units here."
 *
 * Q: I hold Ravenbloom Conservatory with 3-Might units; the opponent attacks with Anivia. Does Anivia kill my
 *    units first, or does my battlefield ability go first?
 * A: The Conservatory resolves first. Both triggers populate the showdown's initial chain: Anivia's "When I attack"
 *    goes on first (turn player), the Conservatory's "When you defend here" is added on top; LIFO ⇒ reveal/draw-or-
 *    recycle happens first, then Anivia deals 3 to each enemy unit there, killing the 3-Might unit.
 * Rules: 383.3.d.1 (simultaneous triggers: turn player's first), 383.4.e/f (attack / defend triggers), 340.1 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CONSERVATORY = "sfd-215-221";
const ANIVIA = "ogn-148-298";
const GUST = "ogn-169-298"; // a real spell for the top of P1's deck
const SKULKER = "ogn-175-298"; // a real vanilla unit for the top of P1's deck

/** P2's turn. P1 controls the Conservatory (live text) with a 3-Might Student; P2's Anivia attacks from base. */
function board(topOfDeck: string) {
  return scenario()
    .active(P2)
    .battlefield("rc", { controller: P1, def: CONSERVATORY, inert: false })
    .unit(P1, "rc", { might: 3, name: "Student" }, "student")
    .unit(P2, "base", ANIVIA, "anivia")
    .deck(P1, [topOfDeck, SKULKER, SKULKER], ["top", "d2", "d3"]);
}

describe("Ruling 2c1317730ef2669e — Conservatory's defend trigger sits on top of Anivia's attack trigger and resolves first", () => {
  test("initial chain order: Anivia (turn player P2) first, Conservatory (defender P1) on top", async () => {
    const game = await board(GUST).build();
    await game.p2.move("anivia", "rc");
    expect(game.state("anivia").combatRole).toBe("attacker");
    expect(game.state("student").combatRole).toBe("defender");
    const chain = game.chain();
    expect(chain.map((c) => c.cardId)).toEqual(["anivia", "rc"]);
    expect(chain[0]).toMatchObject({ controller: P2, triggered: true });
    expect(chain[1]).toMatchObject({ controller: P1, triggered: true });
    // Nothing has happened yet: Student undamaged, top card still on the deck.
    expect(game.state("student").damage).toBe(0);
    expect(game.p1.deck()[0]).toBe("top");
  });

  test("spell on top: Conservatory resolves FIRST (spell → P1's hand) while the Student is still alive; THEN Anivia deals 3 and kills the Student", async () => {
    const game = await board(GUST).build();
    await game.p2.move("anivia", "rc");
    // Resolve only the top item (Conservatory).
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["anivia"]);
    expect(game.zoneOf("top")).toBe("hand");
    expect(game.p1.hand()).toContain("top");
    expect(game.zoneOf("student")).toBe("battlefield-rc"); // still alive at this point
    expect(game.state("student").damage).toBe(0);
    // Now Anivia's trigger resolves.
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("student")).toBe("trash");
    await game.settle();
    expect(game.gameState.battlefields.rc?.controller).toBe(P2); // Anivia conquers the emptied battlefield
    expect(game.zoneOf("anivia")).toBe("battlefield-rc");
    expect(game.violations()).toEqual([]);
  });

  test("non-spell on top: Conservatory recycles it (bottom of P1's deck, not hand); then Anivia's 3 damage kills the Student", async () => {
    const game = await board(SKULKER).build();
    await game.p2.move("anivia", "rc");
    expect(game.chain().map((c) => c.cardId)).toEqual(["anivia", "rc"]);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["anivia"]);
    expect(game.p1.hand()).not.toContain("top");
    expect(game.p1.deck().at(-1)).toBe("top"); // recycled to the bottom
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.zoneOf("student")).toBe("battlefield-rc");
    await game.settle();
    expect(game.zoneOf("student")).toBe("trash");
    expect(game.gameState.battlefields.rc?.controller).toBe(P2);
  });
});
