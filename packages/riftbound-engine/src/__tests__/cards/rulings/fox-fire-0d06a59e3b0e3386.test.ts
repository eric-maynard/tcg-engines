/**
 * Ruling 0d06a59e3b0e3386 — Fox-Fire (OGN-256 → ogn-256-298) · Calm/Mind · [Hidden][Action] · [3]
 *     "Kill any number of units at a battlefield with total Might 4 or less."
 *
 * Q: Can Fox-Fire pick units at DIFFERENT battlefields, or must all targets be at a single battlefield?
 * A: All chosen units must be at one battlefield. Played from hidden, they must be at the battlefield Fox-Fire was hidden at.
 * Rules: 355.12 ("any number of … at a battlefield" — one battlefield scopes the whole set), 811.1.d.2 (hidden: targets here only).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FOX_FIRE = "ogn-256-298";

/** P1's turn with [3] and Fox-Fire in hand. P2: A (2) + C (1) at bf1, B (2) at bf2. */
function fromHand() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "A" }, "a")
    .unit(P2, "bf1", { might: 1, name: "C" }, "c")
    .unit(P2, "bf2", { might: 2, name: "B" }, "b")
    .hand(P1, FOX_FIRE, "fox");
}

const asSet = (v: unknown) => (Array.isArray(v) ? [...v].map(String).sort().join("+") : String(v));

describe("Ruling 0d06a59e3b0e3386 — Fox-Fire's targets must share ONE battlefield", () => {
  test("from hand: the legal target sets include A+C (both at bf1, total 3) but never A+B (2 + 2 across bf1/bf2) — forcing A+B is rejected", async () => {
    const game = await fromHand().build();
    const sets = (game.p1.option("cast", "fox")?.fields.find((f) => f.name === "targets")?.options ?? []).map(asSet);
    expect(sets).toContain("a+c");
    expect(sets).toContain("b");
    expect(sets).not.toContain("a+b");
    expect(sets).not.toContain("b+c");
    const r = await game.p1.try((p) => p.cast("fox", { targets: ["a", "b"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("fox")).toBe("hand");
  });

  test("casting it on A + C (same battlefield) kills both; B at the other battlefield is untouched", async () => {
    const game = await fromHand().build();
    await game.p1.cast("fox", { targets: ["a", "c"] });
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("c")).toBe("trash");
    expect(game.zoneOf("b")).toBe("battlefield-bf2");
    expect(game.violations()).toEqual([]);
  });

  test("from HIDDEN at bf1 (flipped on a later turn for [0]): only bf1's units are offered — B at bf2 can't be chosen even though 2 ≤ 4", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 5, name: "Keeper" }, "keeper")
      .unit(P2, "bf1", { might: 2, name: "A" }, "a")
      .unit(P2, "bf2", { might: 2, name: "B" }, "b")
      .facedown(P1, "bf1", FOX_FIRE, "fox")
      .build();
    expect(game.p1.can("reveal", "fox")).toBe(true);
    const offered = new Set((game.p1.option("reveal", "fox")?.fields.find((f) => f.name === "targets")?.options ?? []).flatMap((o) => (Array.isArray(o) ? o : [o])).map(String));
    expect(offered.has("b")).toBe(false);
    expect((await game.p1.try((p) => p.reveal("fox", { targets: ["b"] }))).ok).toBe(false);
    await game.p1.reveal("fox", { targets: ["a"] });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("battlefield-bf2");
  });
});
