/**
 * Ruling 25d16458d5db8512 — Singularity (OGN-105 → ogn-105-298) · Mind · [6][mind][mind]
 *     "Deal 6 to each of up to two units."
 *
 * Q: Can I choose the same unit twice with Singularity to deal it 12?
 * A: No. "Up to two units" means 0, 1 or 2 units and the two must be DIFFERENT — one target takes 6,
 *    two targets take 6 each. There is no way to stack both instances on one unit.
 * Rules: 355.9 (each object may be chosen once per instruction), 355.13 ("up to N" allows fewer), 417.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SINGULARITY = "ogn-105-298";

/** P1's main phase, [6][mind][mind] banked; P2 has two fat units (10 Might) that survive 6 damage. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 2 } })
    .unit(P2, "base", { might: 10, name: "Alpha" }, "alpha")
    .unit(P2, "base", { might: 10, name: "Beta" }, "beta")
    .hand(P1, SINGULARITY, "sing");
}

function targetSets(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>): string[] {
  const field = game.p1.option("cast", "sing")?.fields.find((f) => f.arg === "targets");
  return (field?.options ?? []).map((o) => (Array.isArray(o) ? [...(o as string[])].join("+") : String(o)));
}

describe("Ruling 25d16458d5db8512 — Singularity's two hits must go to two DIFFERENT units", () => {
  test("ruling: the offered target sets never repeat a unit — no 'alpha+alpha'", async () => {
    const game = await board().build();
    const sets = targetSets(game);
    expect(sets).not.toContain("alpha+alpha");
    expect(sets).not.toContain("beta+beta");
  });

  test("ruling: submitting the same unit twice is refused", async () => {
    const game = await board().build();
    const res = await game.p1.try((p) => p.cast("sing", { targets: ["alpha", "alpha"] }));
    expect(res.ok).toBe(false);
    expect(game.zoneOf("sing")).toBe("hand");
    expect(game.state("alpha").damage).toBe(0);
  });

  test("two DIFFERENT units: each takes 6 (not 12 on one)", async () => {
    const game = await board().build();
    await game.p1.cast("sing", { targets: ["alpha", "beta"] });
    await game.settle();
    expect(game.state("alpha").damage).toBe(6);
    expect(game.state("beta").damage).toBe(6);
    expect(game.zoneOf("sing")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("one unit: it takes 6, the other is untouched", async () => {
    const game = await board().build();
    await game.p1.cast("sing", { targets: "alpha" });
    await game.settle();
    expect(game.state("alpha").damage).toBe(6);
    expect(game.state("beta").damage).toBe(0);
    expect(game.zoneOf("sing")).toBe("trash");
  });
});
