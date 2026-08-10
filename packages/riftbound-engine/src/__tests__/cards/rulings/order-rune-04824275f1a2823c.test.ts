/**
 * Ruling 04824275f1a2823c — Order Rune (OGN-214 → ogn-214-298) · Rune (general rune-deck procedure)
 *
 * Q: Can I track recycled runes by turning them face-down / sideways in my rune deck during the turn and fix it at end
 *    of turn?
 * A: No (a physical-presentation / tournament-policy point). The game facts it rests on: power costs — including any
 *    rune recycling — are paid BEFORE the card hits the field; a recycled rune goes to the bottom of the rune deck
 *    IMMEDIATELY, in the order recycled (the order matters); floating energy/power is what may be tracked with markers.
 *    The physical "no sideways cards in a deck" policy itself is not an engine behaviour and is not modelled here.
 * Rules: 154–155 (rune deck is an ordered face-down zone), 417 / 431 (Recycle: to the bottom of its deck), 356–357
 *        (costs are paid as part of playing, before the card resolves/enters), DESIGN "Paying costs" (manual pay).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const ORDER_RUNE = "ogn-214-298";
const KARTHUS = "ogn-236-298"; // Unit · [3][order] · 3 Might — something that needs one Order power

/** P1's turn: three channeled Order Runes r1–r3 (ready), a 4-card rune deck underneath, [3] floating, Karthus in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .rune(P1, ORDER_RUNE, { alias: "r1" })
    .rune(P1, ORDER_RUNE, { alias: "r2" })
    .rune(P1, ORDER_RUNE, { alias: "r3" })
    .hand(P1, KARTHUS, "karthus");
}

describe("Ruling 04824275f1a2823c — recycled runes go straight to the bottom of the rune deck, in order, before the paid-for card is played", () => {
  test("recycling a rune moves it to the BOTTOM of the rune deck immediately (not at end of turn) and floats 1 power", async () => {
    const game = await board().build();
    const deckBefore = game.p1.runeDeck();
    expect(game.p1.runes()).toEqual(["r1", "r2", "r3"]);
    await game.p1.recycleRune("r2");
    expect(game.p1.runes()).toEqual(["r1", "r3"]);
    expect(game.p1.runeDeck()).toHaveLength(deckBefore.length + 1);
    expect(game.p1.runeDeck().at(-1)).toBe("r2"); // bottom, right now
    expect(game.p1.runeDeck().slice(0, deckBefore.length)).toEqual(deckBefore); // the rest of the deck is undisturbed
    expect(game.p1.power("order")).toBe(1); // the floating power is the trackable thing
    expect(game.zoneOf("r2")).toBe("runeDeck");
  });

  test("the ORDER of recycling is preserved at the bottom: r3 then r1 ⇒ …, r3, r1 (r1 lowest)", async () => {
    const game = await board().build();
    await game.p1.recycleRune("r3");
    await game.p1.recycleRune("r1");
    expect(game.p1.runeDeck().slice(-2)).toEqual(["r3", "r1"]);
    expect(game.p1.power("order")).toBe(2);
    expect(game.p1.runes()).toEqual(["r2"]);
  });

  test("costs first, then the card: with [3] but no Order power Karthus ([3][order]) is not playable; recycle one rune (it is already at the bottom of the deck) and only THEN play him — the pip is paid from the floated power", async () => {
    const game = await board().build();
    expect(game.p1.can("play", "karthus")).toBe(false); // nothing is auto-recycled mid-play
    await game.p1.recycleRune("r1");
    expect(game.p1.runeDeck().at(-1)).toBe("r1"); // in the deck before Karthus is even announced
    expect(game.p1.can("play", "karthus")).toBe(true);
    await game.p1.play("karthus");
    expect(game.zoneOf("karthus")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.p1.runeDeck().at(-1)).toBe("r1");
    expect(game.violations()).toEqual([]);
  });
});
