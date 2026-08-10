/**
 * Ruling 86170c9937a17eb0 — Gust (OGN-169 → ogn-169-298) · [Reaction] · 1 · "Return a unit at a battlefield with 3
 *     [Might] or less to its owner's hand."
 *   × Discipline (OGN-058 → ogn-058-298) · [Reaction] · 2 · "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Q: Opponent Gusts my 2-Might unit; I respond with Discipline making it 4 Might. Does Gust still bounce it?
 * A: No. Targets are checked at play AND at resolution. Discipline resolves first (LIFO) → the unit is 4 Might →
 *    it no longer meets "3 or less", so Gust resolves with no effect.
 * Rules: 359.3.e.2 / 359.3.e.4 (target re-checked on resolution), 359.3.e.5 (illegal target unaffected), 337 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const DISCIPLINE = "ogn-058-298";

/** P1's turn (the Gust player). P2's Scout (2) sits at P2's bf1; P2 holds Discipline with [2]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Scout" }, "scout")
    .hand(P1, GUST, "gust")
    .hand(P2, DISCIPLINE, "disc");
}

async function gustThenDiscipline(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("gust", { targets: "scout" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gust", targets: ["scout"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "disc")).toBe(true);
  await game.p2.cast("disc", { targets: "scout" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["gust", "disc"]);
  return game;
}

describe("Ruling 86170c9937a17eb0 — Discipline in response makes the unit an illegal Gust target at resolution", () => {
  test("Gust's target is legal when played (Scout is 2 Might at a battlefield)", async () => {
    const game = await board().build();
    const offered = game.p1.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(offered.flat()).toContain("scout");
  });

  test("Discipline resolves first: Scout is 4 Might (and P2 drew 1) while Gust still waits on the chain", async () => {
    const game = await gustThenDiscipline();
    const p2Hand = game.p2.hand().length;
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("scout").might).toBe(4);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["gust"]);
  });

  test("ruling 86170c9937a17eb0 — Gust then re-checks: 4 Might > 3 → it resolves with no effect; Scout stays at bf1, Gust goes to trash, its cost stays paid", async () => {
    const game = await gustThenDiscipline();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
    expect(game.p2.hand()).not.toContain("scout");
    expect(game.state("scout").might).toBe(4);
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control: without the response Gust returns the 2-Might Scout to P2's hand", async () => {
    const game = await board().build();
    await game.p1.cast("gust", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p2.hand()).toContain("scout");
  });
});
