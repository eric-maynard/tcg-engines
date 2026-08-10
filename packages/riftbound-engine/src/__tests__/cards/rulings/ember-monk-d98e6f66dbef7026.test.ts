/**
 * Ruling d98e6f66dbef7026 — Ember Monk (ogn-167-298) × cards played from [Hidden] (Teemo, Scout ogn-197-298 as the hidden card;
 *   Ravenbloom Student ogn-103-298 is cited only as a similar stacking trigger)
 *   Ember Monk — Unit · Chaos · 4 Might: "When you play a card from [Hidden], give me +2 [Might] this turn."
 *
 * Q: Does the +2 stack if several cards are played from hidden in one turn, and does it matter which battlefield the
 *    hidden cards were at?
 * A: Yes it stacks (+2 per card: 6, then 8 …) and lasts until end of turn; the battlefield the card was hidden at is
 *    irrelevant. (Reminder: a card can't be played from hidden the turn it was hidden.)
 * Rules: 811 (Hidden; may be played starting the next turn), 383 (trigger per event), 317.2 (this-turn effects expire).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const EMBER_MONK = "ogn-167-298";
const TEEMO_SCOUT = "ogn-197-298"; // [Hidden] 1-Might unit

/**
 * P1's turn 3. P1 controls bf1 and bf2 (a Guard on each) with a Teemo, Scout facedown at EACH (hidden on an earlier turn);
 * Ember Monk sits in P1's base; a third Teemo in hand and one [rainbow] to hide it with.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 0, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Guard One" }, "g1")
    .unit(P1, "bf2", { might: 2, name: "Guard Two" }, "g2")
    .unit(P2, "bf3", { might: 3, name: "Enemy" }, "enemy")
    .unit(P1, "base", EMBER_MONK, "monk")
    .facedown(P1, "bf1", TEEMO_SCOUT, "t1")
    .facedown(P1, "bf2", TEEMO_SCOUT, "t2")
    .hand(P1, TEEMO_SCOUT, "t3");
}

describe("Ruling d98e6f66dbef7026 — Ember Monk's +2 stacks per hidden play, from any battlefield, until end of turn", () => {
  test("first card played from hidden (Teemo at bf1, the Monk is in base — a different location): Monk 4 → 6", async () => {
    const game = await board().build();
    expect(game.state("monk").might).toBe(4);
    expect(game.p1.can("reveal", "t1")).toBe(true);
    await game.p1.reveal("t1");
    await game.settle();
    expect(game.locationOf("t1")).toBe("bf1");
    expect(game.state("monk")).toMatchObject({ might: 6, mightModifier: 2 });
  });

  test("second card played from hidden the same turn, from a DIFFERENT battlefield (bf2): it stacks — Monk 6 → 8", async () => {
    const game = await board().build();
    await game.p1.reveal("t1");
    await game.settle();
    await game.p1.reveal("t2");
    await game.settle();
    expect(game.locationOf("t2")).toBe("bf2");
    expect(game.state("monk")).toMatchObject({ might: 8, mightModifier: 4 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("the boost persists for the rest of the turn and is gone after the turn ends (back to 4 on P2's turn)", async () => {
    const game = await board().build();
    await game.p1.reveal("t1");
    await game.settle();
    await game.p1.reveal("t2");
    await game.settle();
    expect(game.state("monk").might).toBe(8);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("monk")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance: a card hidden THIS turn can't be played from hidden this turn — hiding the third Teemo at bf1 gives no reveal option (and no further +2)", async () => {
    const game = await board().build();
    await game.p1.reveal("t1"); // frees bf1's facedown slot
    await game.settle();
    expect(game.state("monk").might).toBe(6);
    expect(game.p1.can("hide", "t3")).toBe(true);
    await game.p1.hide("t3", "bf1");
    expect(game.zoneOf("t3")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "t3")).toBe(false);
    expect(game.state("monk").might).toBe(6); // hiding is not playing from hidden
  });
});
