/**
 * Ruling 5640590f0ee9f3c9 — (no specific card) when is the rune pool emptied, and can a Seal be tapped
 * twice by tapping it "before it readies"?
 *
 * Q: When do the Energy and Power pools clean up? Can I tap a seal at the beginning of a turn before it
 *    readies, to use it twice?
 * A: The Rune Pool empties at exactly two moments: after the Draw Phase and at the end of each turn
 *    (Expiration Step). And no, you cannot double-tap: the Awaken Phase is the very first thing on your
 *    turn and readies everything you control, and anything you floated last turn is already gone. One
 *    tap per turn is all you get.
 * Rules: 166 / 315.4.d (pool empties after the Draw Phase), 317.2.d (Expiration Step empties pools),
 *        315.1 (Awaken Phase readies your game objects first), 150.2 (Main Phase + Open State for gear
 *        abilities).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

describe("Ruling 5640590f0ee9f3c9 — rune-pool cleanup and the Awaken Phase", () => {
  test("a rune exhausted this turn cannot be tapped again this turn: one Energy, and no second tap available", async () => {
    const game = await scenario().rune(P1, "fury", { alias: "r1" }).build();
    await game.p1.tapRune("r1");
    expect(game.p1.energy()).toBe(1);
    expect(game.state("r1").isExhausted).toBe(true);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    const again = await game.p1.try((p) => p.tapRune("r1"));
    expect(again.ok).toBe(false);
    expect(game.p1.energy()).toBe(1);
  });

  test("the Energy floated is gone at end of turn, and the Awaken Phase readies the rune BEFORE anything else — so there is never a moment to tap it 'while still exhausted'", async () => {
    const game = await scenario().rune(P1, "fury", { alias: "r1" }).build();
    await game.p1.tapRune("r1");
    expect(game.p1.energy()).toBe(1);
    await game.advanceTurn(); // P1 ends → pool empties
    expect(game.p1.energy()).toBe(0);
    expect(game.trace().expiration[0]?.poolsEmptied?.[P1]).toMatchObject({ energy: 1 });
    expect(game.state("r1").isExhausted).toBe(true); // still exhausted during the OPPONENT's turn
    await game.advanceTurn(); // P2 ends → P1's Awaken readies it
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("r1").isExhausted).toBe(false);
    expect(game.p1.energy()).toBe(0); // and the pool is empty again after the Draw Phase
  });

  test("the pool empties after the Draw Phase too: Energy floated during the opponent's turn is not there in your Main Phase", async () => {
    const game = await scenario()
      .active(P2)
      .rune(P1, "fury", { alias: "r1" })
      .resources(P1, { energy: 1 }) // floated earlier, during the opponent's turn
      .build();
    expect(game.p1.energy()).toBe(1);
    await game.advanceTurn(); // P2 ends → P1's Awaken / Channel / Draw / Main
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.energy()).toBe(0);
    // ...but the rune itself was readied by Awaken, so this turn's single tap is available
    expect(game.state("r1").isExhausted).toBe(false);
    await game.p1.tapRune("r1");
    expect(game.p1.energy()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("both emptying points are recorded once per turn end, for every player's pool", async () => {
    const game = await scenario()
      .runes(P1, "fury", 2)
      .runes(P2, "calm", 2)
      .resources(P2, { energy: 2 }) // P2 floated during their own turn
      .build();
    await game.p1.tapRunes(2);
    expect([game.p1.energy(), game.p2.energy()]).toEqual([2, 2]);
    await game.advanceTurn();
    expect([game.p1.energy(), game.p2.energy()]).toEqual([0, 0]);
    expect(game.trace().expiration[0]?.poolsEmptied?.[P2]).toMatchObject({ energy: 2 });
    expect(game.violations()).toEqual([]);
  });
});
