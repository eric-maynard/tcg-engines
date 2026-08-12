/**
 * Ruling f792b1ff5a171fbf — Stand United (OGN-053 → ogn-053-298) · 3 · [Action] [Hidden]
 *   "Buff a friendly unit. Buffs give an additional +1 [Might] to friendly units this turn."
 *   × Lee Sin, Ascetic (ogn-078-298) · 5 Might "[Shield] / [Exhaust]: Buff me. / I can have any
 *     number of buffs."
 *
 * Q: If Lee Sin is carrying X buffs, does Stand United give him an extra X Might?
 * A: Yes. The "+1 per buff" is per BUFF, not per buffed unit, so a unit whose ability lifts the
 *    one-buff cap collects the bonus once for every buff it holds.
 * Rules: 702.3 ("I can have any number of buffs" lifts the cap), 703 (each buff is +1 Might),
 *        the turn-long static applies to every buff a friendly unit holds.
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const STAND_UNITED = "ogn-053-298";
const LEE_SIN = "ogn-078-298";

/** Lee Sin already holds `buffs` buffs; a plain 3-Might Other is the Stand United buff target. */
function board(buffs: number) {
  return scenario()
    .resources(P1, { energy: 3 })
    .unit(P1, "base", LEE_SIN, "lee", { buffed: buffs > 0, extraBuffs: Math.max(0, buffs - 1) })
    .unit(P1, "base", { might: 3, name: "Other" }, "other")
    .hand(P1, STAND_UNITED, "standUnited");
}

describe("Ruling f792b1ff5a171fbf — Stand United's bonus counts each of Lee Sin's buffs", () => {
  test("setup: three buffs put the 5-Might Lee Sin at 8", async () => {
    const game = await board(3).build();
    expect(game.state("lee").might).toBe(8);
    expect(game.state("lee").isBuffed).toBe(true);
  });

  test("Stand United buffing the OTHER unit still gives Lee +3 — one for each buff he holds", async () => {
    const game = await board(3).build();
    await game.p1.cast("standUnited", { targets: "other" });
    await game.settle();
    expect(game.state("lee").might).toBe(11); // 8 + 3
    expect(game.state("other").might).toBe(5); // 3 + its new buff + 1 for that one buff
    expect(game.violations()).toEqual([]);
  });

  test("the bonus scales with the buff count: one buff on Lee gives only +1", async () => {
    const game = await board(1).build();
    expect(game.state("lee").might).toBe(6);
    await game.p1.cast("standUnited", { targets: "other" });
    await game.settle();
    expect(game.state("lee").might).toBe(7); // 6 + 1
  });

  test("an unbuffed unit gets nothing from it", async () => {
    const game = await board(0).build();
    expect(game.state("lee").might).toBe(5);
    await game.p1.cast("standUnited", { targets: "other" });
    await game.settle();
    expect(game.state("lee").might).toBe(5);
  });

  test("the bonus is 'this turn' only — the buffs themselves stay, the extra Might does not", async () => {
    const game = await board(3).build();
    await game.p1.cast("standUnited", { targets: "other" });
    await game.settle();
    expect(game.state("lee").might).toBe(11);
    await game.advanceTurn();
    expect(game.state("lee").might).toBe(8); // still three buffs, no Stand United bonus
    expect(game.state("other").might).toBe(4); // keeps the buff it was given
  });
});
