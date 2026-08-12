/**
 * Ruling 8d1a1020f22a37a4 — Peak Guardian (OGN-223 → ogn-223-298) · Unit · Order · [6][order] · 5 Might
 *   "When you play me, buff me. Then, if I am at a battlefield, buff all other friendly units there."
 *
 * Q: Is the second sentence ("Then, if I am at a battlefield, buff all other friendly units there") a
 *    passive that keeps applying, or a one-shot?
 * A: One-shot. The whole line is a single "when you play me" trigger: it goes on the chain once and both
 *    halves resolve then and there — the first half first, the second only if the condition holds at that
 *    moment. Nothing lingers, so friends who show up later get nothing.
 * Rules: 383.2 / 383.3 (a triggered ability goes on the chain and resolves once), 154.3 (finish resolving
 *        an item's instructions in order), 371 (a static/continuous effect is a different animal — this is
 *        not one), 702 ([Buff]: a +1 [Might] buff if it does not already have one).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PEAK_GUARDIAN = "ogn-223-298";

/** P1's turn with [6][order] up, one friendly at bf1 and one sitting at home. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
    .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
    .unit(P2, "bf1", { might: 1, name: "Squatter" }, "squatter")
    .hand(P1, PEAK_GUARDIAN, "pg");
}

describe("Ruling 8d1a1020f22a37a4 — the 'Then, if I am at a battlefield…' half is part of one play trigger, not a passive", () => {
  test("played to a battlefield: ONE triggered item goes on the chain, and when it resolves the Guardian and the friend already there are buffed", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
      .hand(P1, PEAK_GUARDIAN, "pg")
      .build();
    await game.p1.play("pg", { to: "bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pg", controller: P1, triggered: true })]);
    expect(game.state("ally").isBuffed).toBe(false); // nothing has happened yet — it is a chain item
    await game.settle();
    expect(game.state("pg").isBuffed).toBe(true); // first half
    expect(game.state("ally")).toMatchObject({ isBuffed: true, might: 3 }); // second half, "there"
    expect(game.state("home")).toMatchObject({ isBuffed: false, might: 2 }); // not at that battlefield
  });

  test("played to the base instead: the first half still buffs the Guardian, the conditional half finds no battlefield and does nothing", async () => {
    const game = await board().build();
    await game.p1.play("pg", { to: "base" });
    await game.settle();
    expect(game.state("pg")).toMatchObject({ isBuffed: true, zone: "base" });
    expect(game.state("ally").isBuffed).toBe(false);
    expect(game.state("home").isBuffed).toBe(false);
  });

  test("it is not a passive: a friend that arrives at the Guardian's battlefield AFTER the trigger resolved is not buffed", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
      .unit(P1, "base", { might: 2, name: "Latecomer" }, "late")
      .hand(P1, PEAK_GUARDIAN, "pg")
      .build();
    await game.p1.play("pg", { to: "bf1" });
    await game.settle();
    expect(game.state("ally").isBuffed).toBe(true);
    await game.p1.move("late", "bf1");
    await game.settle();
    expect(game.locationOf("late")).toBe("bf1");
    expect(game.state("late")).toMatchObject({ isBuffed: false, might: 2 });
    expect(game.violations()).toEqual([]);
  });

  test("enemy units at the same battlefield are never touched — 'all other FRIENDLY units there'", async () => {
    const game = await board().build();
    await game.p1.play("pg", { to: "bf1" });
    await game.settle();
    expect(game.has("squatter") && game.state("squatter").isBuffed).toBe(false);
  });
});
