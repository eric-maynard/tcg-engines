/**
 * Ruling 073231c2c08eaf22 — Singularity (OGN-105 → ogn-105-298) · Mind spell · [6][mind][mind]
 *   "Deal 6 to each of up to two units."
 *
 * Q: Can I Singularity ONE unit for 12 damage?
 * A: No. "Up to two units" means 0, 1 or 2 DISTINCT units, each taking 6. Choosing one unit deals it 6; the same unit
 *    cannot be chosen twice to stack 12.
 * Rules: 355.12–355.13 ("up to N" target sets: distinct objects, zero allowed), 355.9 (an object can be chosen once per
 *        targeting instruction).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SINGULARITY = "ogn-105-298";

/** P1's turn with exactly [6][mind][mind]. P2: Titan (10 — survives 6 but not 12) and Grunt (7) in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "base", { might: 10, name: "Titan" }, "titan")
    .unit(P2, "base", { might: 7, name: "Grunt" }, "grunt")
    .hand(P1, SINGULARITY, "sing");
}

const targetSets = (game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>) =>
  (game.p1.option("cast", "sing")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][];

describe("Ruling 073231c2c08eaf22 — 'up to two units' = 0, 1 or 2 DISTINCT units at 6 each; never one unit twice", () => {
  test("the legal target sets are the empty set, each single unit, and the distinct pair — no set names the same unit twice", async () => {
    const game = await board().build();
    const sets = targetSets(game);
    expect(sets).toContainEqual(["titan"]);
    expect(sets).toContainEqual(["grunt"]);
    expect(sets.some((s) => s.length === 2 && s.includes("titan") && s.includes("grunt"))).toBe(true);
    expect(sets.some((s) => s.length === 2 && s[0] === s[1])).toBe(false);
    expect(sets.every((s) => s.length <= 2)).toBe(true);
  });

  test("choosing ONE unit: Titan takes exactly 6 (survives at 10 Might) — not 12", async () => {
    const game = await board().build();
    await game.p1.cast("sing", { targets: ["titan"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sing", targets: ["titan"] })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("sing")).toBe("trash");
    expect(game.state("titan")).toMatchObject({ damage: 6, zone: "base" });
    expect(game.state("grunt").damage).toBe(0);
  });

  test("naming the same unit twice is rejected outright; Titan is undamaged and Singularity stays in hand", async () => {
    const game = await board().build();
    const r = await game.p1.try((p) => p.cast("sing", { targets: ["titan", "titan"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("sing")).toBe("hand");
    expect(game.state("titan").damage).toBe(0);
    expect(game.p1.energy()).toBe(6);
    expect(game.chain()).toEqual([]);
  });

  test("choosing TWO distinct units: 6 to each — Grunt (7) survives with 6, Titan has 6", async () => {
    const game = await board().build();
    await game.p1.cast("sing", { targets: ["titan", "grunt"] });
    await game.settle();
    expect(game.state("titan").damage).toBe(6);
    expect(game.state("grunt")).toMatchObject({ damage: 6, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("choosing ZERO units is also legal: the spell is cast and resolves doing nothing", async () => {
    const game = await board().build();
    expect(targetSets(game)).toContainEqual([]);
    await game.p1.cast("sing", { targets: [] });
    await game.settle();
    expect(game.zoneOf("sing")).toBe("trash");
    expect(game.state("titan").damage).toBe(0);
    expect(game.state("grunt").damage).toBe(0);
    expect(game.p1.energy()).toBe(0);
  });
});
