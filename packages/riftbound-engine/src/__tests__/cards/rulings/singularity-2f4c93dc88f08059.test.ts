/**
 * Ruling 2f4c93dc88f08059 — Singularity (OGN-105 → ogn-105-298) · [6][mind][mind]
 *     "Deal 6 to each of up to two units."
 *
 * Q: Can I play Singularity when my opponent has only one unit and I have three?
 * A: Yes. "Up to two" means you may choose zero, one or two units, so a single enemy unit is a perfectly
 *    legal set — you are never forced to fill the second slot with one of your own.
 * Rules: 355.13 ("up to N" is satisfied by any number from 0 to N, including 0), 355.8 (legality only needs
 *        a legal choice to exist), 355.14 (the chosen set is fixed when the spell is played).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SINGULARITY = "ogn-105-298";

/** P1's turn with exactly [6][mind][mind]. P1 has three units at bf1; P2 has a single 9-Might Wall at bf2. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 8, name: "Mine A" }, "a")
    .unit(P1, "bf1", { might: 8, name: "Mine B" }, "b")
    .unit(P1, "base", { might: 8, name: "Mine C" }, "c")
    .unit(P2, "bf2", { might: 9, name: "Wall" }, "wall")
    .hand(P1, SINGULARITY, "singularity");
}

describe("Ruling 2f4c93dc88f08059 — 'up to two' lets you name just the one enemy unit", () => {
  test("naming only the enemy Wall is legal: it takes 6 and none of P1's three units is touched", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "singularity")).toBe(true);
    await game.p1.cast("singularity", { targets: ["wall"] });
    await game.settle();
    expect(game.zoneOf("singularity")).toBe("trash");
    expect(game.state("wall")).toMatchObject({ damage: 6, might: 9 });
    for (const mine of ["a", "b", "c"]) {
      expect(game.state(mine).damage).toBe(0);
    }
    expect(game.violations()).toEqual([]);
  });

  test("the enumerated target sets include one-unit sets — a lone enemy unit is offered on its own, not only paired with a friendly", async () => {
    const game = await board().build();
    const options = game.p1.option("cast", "singularity")?.fields.find((f) => f.name === "targets")?.options ?? [];
    const sets = options.map((o) => (Array.isArray(o) ? [...o].sort().join("+") : String(o)));
    expect(sets).toContain("wall");
    expect(sets.some((s) => s.includes("+"))).toBe(true); // two-unit sets exist as well
  });

  test("with only one unit on the board at all, Singularity is still castable and deals its 6", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { mind: 2 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 9, name: "Wall" }, "wall")
      .hand(P1, SINGULARITY, "singularity")
      .build();
    expect(game.p1.can("cast", "singularity")).toBe(true);
    await game.p1.cast("singularity", { targets: ["wall"] });
    await game.settle();
    expect(game.state("wall").damage).toBe(6);
  });
});
