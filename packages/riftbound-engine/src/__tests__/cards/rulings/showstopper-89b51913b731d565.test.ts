/**
 * Ruling 89b51913b731d565 — Showstopper (OGN-270 → ogn-270-298) · Spell · [1][rainbow] · Action
 *   "Buff a friendly unit in your base, then move it to a battlefield."
 *
 * Q: When a spell like Showstopper moves a unit into an attack, can other units in the base come along?
 * A: No. The spell moves exactly the one unit it names; it attacks alone. Only the STANDARD MOVE action
 *    lets you send several units to the same battlefield together.
 * Rules: 355.10 (an effect moves only the objects it chooses — here a single "a friendly unit"),
 *        144.1 (the Standard Move may move any number of your ready units to one location), 449.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SHOWSTOPPER = "ogn-270-298";

/** P1's turn with exactly [1][rainbow]. Three ready units in P1's base; P2 durably holds bf1 with a big Guard. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 3, name: "Star" }, "star")
    .unit(P1, "base", { might: 3, name: "Backup" }, "backup")
    .unit(P1, "base", { might: 3, name: "Extra" }, "extra")
    .hand(P1, SHOWSTOPPER, "ss");
}

describe("Ruling 89b51913b731d565 — a unit moved by Showstopper attacks alone", () => {
  test("ruling: Showstopper chooses ONE unit — its target field lists the base units one at a time, never a group", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "ss")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(targets.flat().sort()).toEqual(["backup", "extra", "star"]);
    expect(targets.every((o) => !Array.isArray(o) || o.length === 1)).toBe(true);
  });

  test("ruling: only the named unit travels — Backup and Extra stay in base and the Star is the lone attacker at bf1", async () => {
    const game = await board().build();
    await game.p1.cast("ss", { targets: "star" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Showstopper resolves; stop before combat damage
    expect(game.locationOf("star")).toBe("bf1");
    expect(game.p1.units("base").sort()).toEqual(["backup", "extra"]);
    expect(game.p1.units("bf1")).toEqual(["star"]);
    expect(game.state("star").combatRole).toBe("attacker");
  });

  test("contrast: the STANDARD move is the only way to send several units at once — move([star, backup, extra]) is legal and all three arrive", async () => {
    const game = await board().build();
    await game.p1.move(["star", "backup", "extra"], "bf1");
    expect(game.p1.units("bf1").sort()).toEqual(["backup", "extra", "star"]);
    expect(game.p1.units("base")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("consequence of attacking alone: the lone 4-Might Star loses to the 9-Might Guard, where three units together would have won", async () => {
    const game = await board().build();
    await game.p1.cast("ss", { targets: "star" });
    await game.settle();
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
