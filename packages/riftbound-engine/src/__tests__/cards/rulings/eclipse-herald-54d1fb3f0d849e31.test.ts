/**
 * Ruling 54d1fb3f0d849e31 — Eclipse Herald (OGN-059 → ogn-059-298) · Unit · Calm · [7][calm] · 7 Might
 *     "When you stun an enemy unit, ready me and give me +1 [Might] this turn."
 *   (The scrape pairs it with unl-063 "Eclipse", a −4 Might spell that does not stun; the stuns here come from Rune Prison
 *    ogn-050-298 · Action · [2][calm] · "Stun a unit.")
 *
 * Q: Can Eclipse Herald ready multiple times per turn, every time you stun an enemy?
 * A: Yes — there is no once-per-turn limit; each enemy stun readies it and adds another +1 [Might] this turn.
 * Rules: 383 (triggered abilities trigger each time their condition is met), 423 (Stun).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ECLIPSE_HERALD = "ogn-059-298";
const RUNE_PRISON = "ogn-050-298";

/** P1's turn: an EXHAUSTED Herald in base, P1 also controls the empty bf2; two Rune Prisons with exactly 2×([2][calm]). P2: two foes at bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { calm: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "base", ECLIPSE_HERALD, "herald", { exhausted: true })
    .unit(P2, "bf1", { might: 3, name: "Foe One" }, "foe1")
    .unit(P2, "bf1", { might: 3, name: "Foe Two" }, "foe2")
    .hand(P1, RUNE_PRISON, "prison1")
    .hand(P1, RUNE_PRISON, "prison2");
}

describe("Ruling 54d1fb3f0d849e31 — Eclipse Herald readies (and grows) once per enemy stun, with no per-turn cap", () => {
  test("first stun: Foe One is stunned → the exhausted Herald readies and goes to 8 Might", async () => {
    const game = await board().build();
    expect(game.state("herald")).toMatchObject({ isExhausted: true, might: 7 });
    await game.p1.cast("prison1", { targets: "foe1" });
    await game.settle();
    expect(game.state("foe1").isStunned).toBe(true);
    expect(game.state("herald")).toMatchObject({ isReady: true, might: 8 });
  });

  test("second stun in the SAME turn: after the Herald exhausts again (it moves to bf2), stunning Foe Two readies it a second time and stacks another +1 → 9 Might", async () => {
    const game = await board().build();
    await game.p1.cast("prison1", { targets: "foe1" });
    await game.settle();
    expect(game.state("herald").isReady).toBe(true);
    await game.p1.move("herald", "bf2"); // Standard Move exhausts it again
    await game.settle();
    expect(game.state("herald")).toMatchObject({ isExhausted: true, location: "bf2", might: 8 });
    await game.p1.cast("prison2", { targets: "foe2" });
    await game.settle();
    expect(game.state("foe2").isStunned).toBe(true);
    expect(game.state("herald")).toMatchObject({ isReady: true, might: 9, mightModifier: 2 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.turnPlayer()).toBe(P1); // all within one turn
    expect(game.violations()).toEqual([]);
    // Both +1s are "this turn".
    await game.advanceTurn();
    expect(game.state("herald").might).toBe(7);
  });
});
