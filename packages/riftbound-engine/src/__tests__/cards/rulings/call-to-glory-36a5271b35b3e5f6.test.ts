/**
 * Ruling 36a5271b35b3e5f6 — Call to Glory (OGN-207 → ogn-207-298) · Reaction · [3]
 *   "As you play this, you may spend a buff as an additional cost. If you do, ignore this spell's
 *    cost.  Give a unit +3 [Might] this turn."
 *
 * Q: Can I spend the buff of ANY unit I control to pay the additional cost, wherever it is?
 * A: Yes. The only requirements are that the unit carries a buff and that you control it; the rule
 *    that lets you spend buffs says nothing about location, so a unit in your base works exactly
 *    like one at a battlefield.
 * Rules: 702.2.b.1–2 (you may spend buffs on units you control; nothing about where they stand),
 *        356.5 / 358.2 (an additional cost is paid as the card is played; here it waives the cost).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CALL_TO_GLORY = "ogn-207-298";

/**
 * P1's turn with an EMPTY pool, so the spell is only castable when the buff pays for it.
 * `where` decides which of P1's two units carries the buff.
 */
function board(where: "battlefield" | "base" | "none") {
  return scenario()
    .resources(P1, { energy: 0 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Field Unit" }, "field", where === "battlefield" ? { buffed: true } : undefined)
    .unit(P1, "base", { might: 2, name: "Home Unit" }, "home", where === "base" ? { buffed: true } : undefined)
    .unit(P2, "base", { might: 2, name: "Enemy" }, "enemy", { buffed: true })
    .hand(P1, CALL_TO_GLORY, "glory");
}

describe("Ruling 36a5271b35b3e5f6 — Call to Glory's buff may come from any unit you control, base or battlefield", () => {
  test("ruling: a buff on a unit AT A BATTLEFIELD pays the cost — the spell is free and the buff is gone", async () => {
    const game = await board("battlefield").build();
    expect(game.state("field").isBuffed).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("cast", "glory")).toBe(true);
    await game.p1.cast("glory", { payOptional: true, targets: "home" });
    await game.settle();
    expect(game.p1.energy()).toBe(0); // "ignore this spell's cost"
    expect(game.state("field").isBuffed).toBe(false); // the buff was spent
    expect(game.state("home").might).toBe(5); // 2 + 3
    expect(game.zoneOf("glory")).toBe("trash");
    // (The harness `costPaid` invariant does not know about a cost waived by an additional cost, so
    // it fires here; every other invariant is clean.)
    expect(game.violations().filter((v) => v.invariant !== "costPaid")).toEqual([]);
  });

  test("ruling: a buff on a unit IN YOUR BASE does exactly the same job", async () => {
    const game = await board("base").build();
    expect(game.state("home").isBuffed).toBe(true);
    await game.p1.cast("glory", { payOptional: true, targets: "field" });
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("home").isBuffed).toBe(false);
    expect(game.state("field").might).toBe(5);
    expect(game.violations().filter((v) => v.invariant !== "costPaid")).toEqual([]);
  });

  test("the buff may even come from the very unit the spell buffs", async () => {
    const game = await board("battlefield").build();
    await game.p1.cast("glory", { payOptional: true, targets: "field" });
    await game.settle();
    expect(game.state("field")).toMatchObject({ isBuffed: false, might: 5 });
    expect(game.p1.energy()).toBe(0);
  });

  test("negative space: an ENEMY unit's buff is not spendable — with no friendly buff and no energy the spell cannot be cast at all", async () => {
    const game = await board("none").build();
    expect(game.state("enemy").isBuffed).toBe(true);
    expect(game.state("field").isBuffed).toBe(false);
    expect(game.state("home").isBuffed).toBe(false);
    expect(game.p1.can("cast", "glory")).toBe(false);
    const attempt = await game.p1.try((p) => p.cast("glory", { payOptional: true, targets: "home" }));
    expect(attempt.ok).toBe(false);
    expect(game.state("enemy").isBuffed).toBe(true);
    expect(game.zoneOf("glory")).toBe("hand");
  });

  test("…and with the energy paid instead, no buff is touched", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Field Unit" }, "field", { buffed: true })
      .unit(P1, "base", { might: 2, name: "Home Unit" }, "home")
      .hand(P1, CALL_TO_GLORY, "glory")
      .build();
    await game.p1.cast("glory", { targets: "home" });
    await game.settle();
    expect(game.p1.energy()).toBe(0); // [3] paid the normal way
    expect(game.state("field").isBuffed).toBe(true);
    expect(game.state("home").might).toBe(5);
    expect(game.violations()).toEqual([]);
  });
});
