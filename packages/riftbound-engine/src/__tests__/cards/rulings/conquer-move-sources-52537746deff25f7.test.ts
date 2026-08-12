/**
 * Ruling 52537746deff25f7 — (no specific card) which units may join a conquering move.
 *   Exercised with inline units, one of them carrying [Ganking].
 *
 * Q: When conquering a battlefield, can I move ready units from base, and can I bring units from
 *    other battlefields?
 * A: Any number of ready units may come from your base. Units sitting at OTHER battlefields may not
 *    join — unless they have [Ganking], in which case one or more of them may come along, all to the
 *    same target battlefield (a standard move has a single destination).
 * Rules: 143.3.a (one destination), 143.3 (movers come from base), 806 ([Ganking] permits
 *        battlefield-to-battlefield movement).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** P1: two ready units in base, plus an Outpost and a [Ganking] unit at their own bf2. P2 holds bf1. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 2, name: "Alpha" }, "a")
    .unit(P1, "base", { might: 2, name: "Bravo" }, "b")
    .unit(P1, "bf2", { might: 2, name: "Outpost" }, "outpost")
    .unit(P1, "bf2", { keywords: ["Ganking"], might: 2, name: "Ganker" }, "ganker");
}

describe("Ruling 52537746deff25f7 — base units always, other battlefields only with [Ganking]", () => {
  test("the move-to-bf1 offer is every subset of the base units, optionally joined by the [Ganking] unit — the plain Outpost is never offered", async () => {
    const game = await board().build();
    const toBf1 = game.p1.legal().find((o) => o.key === "standardMove:to:bf1");
    expect(toBf1).toBeDefined();
    const sets = (toBf1?.variants ?? []).map((v) => (v.params.unitIds as string[]).join("+"));
    expect(sets).toEqual(["a", "b", "a+b", "ganker", "a+ganker", "b+ganker", "a+b+ganker"]);
    expect(sets.some((s) => s.includes("outpost"))).toBe(false);
    // …and every one of them lands at the single destination bf1 (143.3.a).
    expect(new Set((toBf1?.variants ?? []).map((v) => v.params.destination))).toEqual(new Set(["bf1"]));
  });

  test("any number of ready base units can move together onto the battlefield", async () => {
    const game = await board().build();
    await game.p1.move(["a", "b"], "bf1");
    expect(game.locationOf("a")).toBe("bf1");
    expect(game.locationOf("b")).toBe("bf1");
    expect(game.locationOf("outpost")).toBe("bf2");
  });

  test("the [Ganking] unit may come along from bf2 in the same move — and only to that same battlefield", async () => {
    const game = await board().build();
    await game.p1.move(["a", "b", "ganker"], "bf1");
    expect(game.locationOf("ganker")).toBe("bf1");
    expect(game.locationOf("a")).toBe("bf1");
    expect(game.locationOf("b")).toBe("bf1");
    expect(game.locationOf("outpost")).toBe("bf2"); // stayed behind
    expect(game.violations()).toEqual([]);
  });

  test("dragging the non-[Ganking] Outpost off bf2 into the attack is refused, and the board is untouched", async () => {
    const game = await board().build();
    const denied = await game.p1.try((p) => p.move(["a", "outpost"], "bf1"));
    expect(denied.ok).toBe(false);
    expect(game.locationOf("a")).toBe("base");
    expect(game.locationOf("outpost")).toBe("bf2");
    // A [Ganking] unit alone is also offered as its own ganking move.
    expect(game.p1.can("gank", "ganker")).toBe(true);
    await game.p1.gank("ganker", "bf1");
    expect(game.locationOf("ganker")).toBe("bf1");
  });
});
