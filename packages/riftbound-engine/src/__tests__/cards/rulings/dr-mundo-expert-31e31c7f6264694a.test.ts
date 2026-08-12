/**
 * Ruling 31e31c7f6264694a — Dr. Mundo, Expert (OGN-109 → ogn-109-298) · 8 + [mind][mind] · 6 Might
 *   "My Might is increased by the number of cards in your trash.
 *    At the start of your Beginning Phase, recycle 3 from your trash."
 *
 * Q: Does Mundo still recycle when there are fewer than 3 cards in the trash?
 * A: Yes. Recycling does not choose targets, so it follows "do as much as you can": with 2 cards in
 *    the trash it recycles both, with an empty trash it simply does nothing. It never fails outright.
 * Rules: 359.3.d ("do as much as you can" for an instruction with no chosen objects), 416 (Recycle),
 *        355.10 (an instruction that names no objects is not a targeting instruction).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DR_MUNDO = "ogn-109-298";
const FILLER = "ogn-175-298";

/** Turn 2, P2 active, so one `advanceTurn()` walks into P1's Beginning Phase. `n` cards sit in P1's trash. */
function board(n: number) {
  let s = scenario().turn(2).active(P2).victoryScore(20).unit(P1, "base", DR_MUNDO, "mundo");
  for (let i = 0; i < n; i++) {
    s = s.trash(P1, FILLER, `t${i}`);
  }
  return s;
}

describe("Ruling 31e31c7f6264694a — Mundo recycles as many as he can, even when the trash holds fewer than 3", () => {
  test("control: with 4 cards in the trash exactly 3 are recycled and 1 is left behind", async () => {
    const game = await board(4).build();
    expect(game.p1.trash()).toHaveLength(4);
    expect(game.state("mundo").might).toBe(10); // 6 + 4 in trash
    const deck0 = game.p1.deck().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    // More cards than the ability takes ⇒ P1 chooses which three (the choice is the caller's, and
    // exists only because there is a surplus).
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? { max: d.max, options: d.options.map((o) => o.card ?? o.key).toSorted() } : {}).toEqual({
      max: 3,
      options: ["t0", "t1", "t2", "t3"],
    });
    await game.p1.pick("t0", "t1", "t2");
    await game.settle();
    expect(game.p1.trash()).toEqual(["t3"]);
    expect(game.p1.deck()).toHaveLength(deck0 + 3 - 1); // 3 recycled in, 1 drawn for the turn
    expect(game.state("mundo").might).toBe(7); // 6 + 1
    expect(game.violations()).toEqual([]);
  });

  test("ruling: with only 2 cards in the trash BOTH are recycled — the ability does not fizzle for being short", async () => {
    const game = await board(2).build();
    expect(game.state("mundo").might).toBe(8);
    const deck0 = game.p1.deck().length;
    await game.advanceTurn();
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck()).toHaveLength(deck0 + 2 - 1);
    expect(game.state("mundo").might).toBe(6); // back to printed Might with an empty trash
    expect(game.violations()).toEqual([]);
  });

  test("…and with a single card it recycles that one", async () => {
    const game = await board(1).build();
    const deck0 = game.p1.deck().length;
    await game.advanceTurn();
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck()).toHaveLength(deck0 + 1 - 1);
    expect(game.state("mundo").might).toBe(6);
  });

  test("…and with an empty trash it simply does nothing: the turn starts normally and Mundo is unharmed", async () => {
    const game = await board(0).build();
    const deck0 = game.p1.deck().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck()).toHaveLength(deck0 - 1); // only the turn's draw
    expect(game.state("mundo")).toMatchObject({ might: 6, zone: "base" });
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
