/**
 * Ruling 2302a5de68ca9714 — Star-Crossed (UNL-128 → unl-128-219) · [3][chaos] [Reaction]
 *   "Return a friendly unit and an enemy unit to their owners' hands."
 *
 * Q: Can I play Star-Crossed if I have no units?
 * A: No. The spell has no "up to" wording, so BOTH a friendly and an enemy unit are mandatory choices
 *    made as it is played. With no friendly unit on the board there is no legal choice for the first
 *    slot, so the spell cannot be played at all (and likewise with no enemy unit).
 * Rules: 355.8 (a card can't be played unless every required choice has a legal object),
 *        355.9 / 355.12 (choices are made on play), 425.1 (nothing is played if it can't be finalized).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";

/** P1's turn with exactly [3][chaos] and Star-Crossed in hand; `mine`/`theirs` toggle the two boards. */
function board(mine: boolean, theirs: boolean) {
  let b = scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .hand(P1, STAR_CROSSED, "sc");
  if (mine) {
    b = b.unit(P1, "base", { might: 2, name: "Ally" }, "ally");
  }
  if (theirs) {
    b = b.unit(P2, "base", { might: 2, name: "Foe" }, "foe");
  }
  return b;
}

describe("Ruling 2302a5de68ca9714 — Star-Crossed needs BOTH a friendly and an enemy unit to be playable", () => {
  test("ruling: with no friendly unit on the board (enemy unit present) Star-Crossed cannot be played", async () => {
    const game = await board(false, true).build();
    expect(game.p1.can("cast", "sc")).toBe(false);
    const r = await game.p1.try((p) => p.cast("sc", { targets: ["foe"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("sc")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 1 } }); // nothing paid
  });

  test("symmetrically: a friendly unit but no enemy unit is also not enough", async () => {
    const game = await board(true, false).build();
    expect(game.p1.can("cast", "sc")).toBe(false);
    const r = await game.p1.try((p) => p.cast("sc", { targets: ["ally"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("sc")).toBe("hand");
  });

  test("with an empty board on both sides it is likewise unplayable", async () => {
    const game = await board(false, false).build();
    expect(game.p1.can("cast", "sc")).toBe(false);
  });

  test("control: with one unit on each side it is legal and returns both to their owners' hands", async () => {
    const game = await board(true, true).build();
    expect(game.p1.can("cast", "sc")).toBe(true);
    await game.p1.cast("sc", { targets: ["ally", "foe"] });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.zoneOf("foe")).toBe("hand");
    expect(game.p1.hand()).toContain("ally");
    expect(game.p2.hand()).toContain("foe");
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
