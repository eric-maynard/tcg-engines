/**
 * Ruling 77e40b09ead73249 — Possession (OGN-203 → ogn-203-298) · Action · Chaos · [8][chaos][chaos][chaos]
 *   "Choose an enemy unit at a battlefield. Take control of it and recall it. (Send it to your base.
 *    This isn't a move.)"
 *
 * Q: Is the stolen unit exhausted when Possession recalls it to my base, or can I move it out the same turn?
 * A: You get it in whatever state it was in. A recall is NOT a move, so it never exhausts anything: a ready
 *    unit stays ready and can be moved to a battlefield the same turn; an exhausted one stays exhausted.
 * Rules: 448 (recall ≠ move — no move triggers, no exhaust), 447.1 (only the Standard Move ability
 *        exhausts the mover), 191.1 (take control).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const POSSESSION = "ogn-203-298";

/** P1's turn. P2 holds bf1 with a Thrall (plus a Holder so bf1 keeps an owner); bf2 is open. */
function board(thrallExhausted: boolean) {
  return scenario()
    .resources(P1, { energy: 8, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Thrall" }, "thrall", thrallExhausted ? { exhausted: true } : undefined)
    .unit(P2, "bf1", { might: 1, name: "Holder" }, "holder")
    .hand(P1, POSSESSION, "possession");
}

describe("Ruling 77e40b09ead73249 — Possession's recall does not exhaust: the unit arrives in the state it was in", () => {
  test("a READY enemy unit becomes P1's, sits in P1's base still ready, and can be moved to a battlefield the same turn", async () => {
    const game = await board(false).build();
    expect(game.state("thrall").isReady).toBe(true);

    await game.p1.cast("possession", { targets: "thrall" });
    await game.settle();
    expect(game.state("thrall").controller).toBe(P1);
    expect(game.state("thrall").owner).toBe(P2);
    expect(game.zoneOf("thrall")).toBe("base");
    expect(game.locationOf("thrall")).toBe("base");
    expect(game.state("thrall").isExhausted).toBe(false); // a recall is not a move — nothing was exhausted

    expect(game.p1.legal().some((o) => o.verb === "move")).toBe(true);
    await game.p1.move("thrall", "bf2");
    expect(game.locationOf("thrall")).toBe("bf2");
    expect(game.state("thrall").isExhausted).toBe(true); // NOW it exhausted — the Standard Move did that
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("an EXHAUSTED enemy unit stays exhausted after Possession and cannot be moved this turn", async () => {
    const game = await board(true).build();
    expect(game.state("thrall").isExhausted).toBe(true);

    await game.p1.cast("possession", { targets: "thrall" });
    await game.settle();
    expect(game.state("thrall").controller).toBe(P1);
    expect(game.zoneOf("thrall")).toBe("base");
    expect(game.state("thrall").isExhausted).toBe(true);
    expect(game.p1.legal().some((o) => o.verb === "move")).toBe(false);
    expect((await game.p1.try((p) => p.move("thrall", "bf2"))).ok).toBe(false);
  });
});
