/**
 * Ruling 39156517f49205fd — Star-Crossed (UNL-128 → unl-128-219) · [Reaction] · [3][chaos]
 *   "Return a friendly unit and an enemy unit to their owners' hands."
 *
 * Q: Can I play Star-Crossed when I control no unit?
 * A: No. Both objects are mandatory (no "up to"), and they are chosen as the spell is
 *    played. With no friendly unit on the board the friendly half cannot be named, so
 *    the spell cannot legally be played at all.
 * Rules: 355.7/355.9 (every object a spell names must be chosen when it is played, and
 *        must match the descriptor), 355.13 (only "up to"/"any number of" may name none),
 *        356.2 (an announcement whose choices cannot be made is rewound).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";

/** P1's turn with exactly [3][chaos] and Star-Crossed in hand; the units on the board vary per case. */
function board(opts: { friendly?: boolean; enemy?: boolean }) {
  let s = scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).hand(P1, STAR_CROSSED, "sc");
  if (opts.friendly) {
    s = s.unit(P1, "base", { might: 2, name: "Lover" }, "mine");
  }
  if (opts.enemy) {
    s = s.unit(P2, "base", { might: 2, name: "Rival" }, "theirs");
  }
  return s;
}

const castable = (game: Game) => game.p1.can("cast", "sc");

describe("Ruling 39156517f49205fd — Star-Crossed needs a friendly unit AND an enemy unit to be played at all", () => {
  test("no friendly unit (only an enemy one): the spell is not offered and casting it is refused — it stays in hand, nothing is paid", async () => {
    const game = await board({ enemy: true }).build();
    expect(game.p1.units()).toEqual([]);
    expect(castable(game)).toBe(false);
    const r = await game.p1.try((p) => p.cast("sc", { targets: ["theirs", "theirs"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("sc")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 1 } });
    expect(game.zoneOf("theirs")).toBe("base");
  });

  test("an empty board on both sides: still not playable", async () => {
    const game = await board({}).build();
    expect(castable(game)).toBe(false);
    expect((await game.p1.try((p) => p.cast("sc"))).ok).toBe(false);
  });

  test("the mirror case is symmetrical — a friendly unit but NO enemy unit is equally unplayable (neither half is 'up to')", async () => {
    const game = await board({ friendly: true }).build();
    expect(game.p1.units()).toEqual(["mine"]);
    expect(castable(game)).toBe(false);
    expect((await game.p1.try((p) => p.cast("sc", { targets: ["mine", "mine"] }))).ok).toBe(false);
    expect(game.zoneOf("mine")).toBe("base");
  });

  test("with one of each it becomes castable, and the two roles are asked as a friendly/enemy pair", async () => {
    const game = await board({ enemy: true, friendly: true }).build();
    expect(castable(game)).toBe(true);
    const field = game.p1.option("cast", "sc")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).map((o) => (Array.isArray(o) ? o.map(String) : [String(o)]))).toEqual([["mine", "theirs"]]);
  });

  test("…and it does what it says: both units go back to their OWNERS' hands", async () => {
    const game = await board({ enemy: true, friendly: true }).build();
    await game.p1.cast("sc", { targets: ["mine", "theirs"] });
    await game.settle();
    expect(game.zoneOf("mine")).toBe("hand");
    expect(game.zoneOf("theirs")).toBe("hand");
    expect(game.p1.hand()).toContain("mine");
    expect(game.p2.hand()).toContain("theirs");
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
