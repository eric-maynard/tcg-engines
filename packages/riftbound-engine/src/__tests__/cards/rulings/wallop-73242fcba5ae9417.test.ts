/**
 * Ruling 73242fcba5ae9417 — Wallop (OGN-146 → ogn-146-298) · Spell · Body · [2] · [Action]
 *     "As you play this, you may spend a buff as an additional cost. If you do, ignore this spell's cost.
 *      Ready a unit."
 *
 * Q: Can you play Wallop at 0 energy?
 * A: Yes — provided you pay the optional additional cost. Spending a buff makes the spell ignore its own [2]
 *    cost, so it is playable with an empty pool. Without a buff to spend you simply cannot afford it.
 * Rules: 357.1 (additional costs), 404.1 (costs paid at finalization), 204.3 (cost modification / "ignore its
 *        cost"), 355.8 (a play with no payable cost line is not offered).
 */
import { describe, expect, test } from "bun:test";
import type { ActionField, Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const WALLOP = "ogn-146-298";

/** P1's turn with `energy` in pool: a buffed Standard-Bearer and an exhausted Veteran in base, Wallop in hand. */
function board(energy: number, buffed = true) {
  return scenario()
    .resources(P1, { energy })
    .unit(P1, "base", { might: 3, name: "Standard-Bearer" }, "bearer", buffed ? { buffed: true } : {})
    .unit(P1, "base", { might: 2, name: "Veteran" }, "veteran", { exhausted: true })
    .hand(P1, WALLOP, "wallop");
}

const payField = (game: Game): ActionField | undefined =>
  game.p1.option("cast", "wallop")?.fields.find((f) => f.arg === "payOptional");

describe("Ruling 73242fcba5ae9417 — Wallop at 0 energy, paid with a buff", () => {
  test("with an empty pool Wallop is still offered — but only in the variant that spends a buff (the free cost line is required)", async () => {
    const game = await board(0).build();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("bearer").isBuffed).toBe(true);
    expect(game.p1.can("cast", "wallop")).toBe(true);
    expect(payField(game)).toMatchObject({ options: [true], required: true });
  });

  test("it actually resolves for free: the buff is spent, the exhausted Veteran is readied, and the pool never went negative", async () => {
    const game = await board(0).build();
    await game.p1.cast("wallop", { payOptional: true, targets: "veteran" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("wallop")).toBe("trash");
    expect(game.state("veteran").isReady).toBe(true);
    expect(game.state("bearer").isBuffed).toBe(false); // the buff was spent as the cost
    expect(game.p1.energy()).toBe(0);
    // The harness `costPaid` invariant compares the pool against the PRINTED [2] and so flags this play; that is
    // exactly the point of the ruling — the cost is ignored — so the invariant report is expected here.
    expect(game.violations().map((v) => v.invariant)).toEqual(["costPaid"]);
  });

  test("no buff to spend and no energy: the spell cannot be played at all", async () => {
    const game = await board(0, false).build();
    expect(game.p1.can("cast", "wallop")).toBe(false);
    expect((await game.p1.try((p) => p.cast("wallop", { targets: "veteran" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("wallop", { payOptional: true, targets: "veteran" }))).ok).toBe(false);
    expect(game.zoneOf("wallop")).toBe("hand");
  });

  test("with [2] in pool the additional cost really is optional — both cost lines are offered, and declining it pays the [2] and keeps the buff", async () => {
    const game = await board(2).build();
    expect(payField(game)?.options).toEqual(expect.arrayContaining([true, false]));
    await game.p1.cast("wallop", { payOptional: false, targets: "veteran" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("veteran").isReady).toBe(true);
    expect(game.state("bearer").isBuffed).toBe(true); // buff untouched
  });
});
