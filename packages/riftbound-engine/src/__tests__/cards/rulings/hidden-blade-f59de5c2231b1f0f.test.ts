/**
 * Ruling f59de5c2231b1f0f — Hidden Blade (OGN-213 → ogn-213-298) · [2][order] · [Hidden] [Action]
 *   "Kill a unit at a battlefield. Its controller draws 2."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · [Hidden] [Action] "Move a unit from a battlefield to its base."
 *
 * Q: I Hidden-Blade a unit at a battlefield; my opponent flips their hidden Fight or Flight in response. Does the unit
 *    survive?
 * A: Yes. Fight or Flight resolves first and sends the unit to its base; it is then no longer "a unit at a battlefield",
 *    so Hidden Blade's target is illegal and it does nothing — the unit lives and nobody draws 2.
 * Rules: 340.1 (LIFO), 359.3.e.5 (targets re-checked on resolution; illegal ⇒ instruction not performed), 811 (hidden
 *        card played as a Reaction for [0]).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/** P1's turn. P2 controls bf1 with a 3-Might Sentry and has Fight or Flight face down there; P1 holds Hidden Blade + [2][order]. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Sentry" }, "sentry")
    .unit(P2, "bf1", { might: 1, name: "Holder" }, "holder")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .hand(P1, HIDDEN_BLADE, "hb");
}

describe("Ruling f59de5c2231b1f0f — Fight or Flight in response saves the Hidden Blade target; no kill, no draw", () => {
  test("Hidden Blade on the Sentry → P2 flips Fight or Flight on it in the Reaction window → FoF resolves first (Sentry home) → Hidden Blade resolves with an illegal target: Sentry alive in base, P2 draws nothing", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    const p1Hand = game.p1.hand().length;
    await game.p1.cast("hb", { targets: "sentry" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hb", controller: P1, targets: ["sentry"] })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "fof")).toBe(true);
    await game.p2.reveal("fof", { answers: ["sentry"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["hb", "fof"]);
    expect(game.p2.energy()).toBe(0); // for [0]

    // FoF resolves first.
    for (let i = 0; i < 4 && game.zoneOf("fof") !== "trash"; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("sentry")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["hb"]);

    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("hb")).toBe("trash"); // resolved, did nothing
    expect(game.state("sentry")).toMatchObject({ damage: 0, zone: "base" }); // survives
    expect(game.p2.hand()).toHaveLength(p2Hand); // "its controller draws 2" not performed
    expect(game.p1.hand()).toHaveLength(p1Hand - 1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // nothing refunded
    expect(game.zoneOf("holder")).toBe("battlefield-bf1"); // Hidden Blade did not re-target
    expect(game.violations()).toEqual([]);
  });

  test("control: unanswered, Hidden Blade kills the Sentry and P2 draws 2", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("hb", { targets: "sentry" });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
  });
});
