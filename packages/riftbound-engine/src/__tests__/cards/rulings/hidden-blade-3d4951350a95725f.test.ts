/**
 * Ruling 3d4951350a95725f — Hidden Blade (ogn-213-298) × Fight or Flight (ogn-168-298)
 *   Hidden Blade: "[Hidden] [Action] Kill a unit at a battlefield. Its controller draws 2." (2 + [order])
 *   Fight or Flight: "[Hidden] [Action] Move a unit from a battlefield to its base." (2)
 *
 * Q: Does Hidden Blade's caster's opponent draw 2 if they Fight-or-Flight the targeted unit home in response?
 * A: No. When Hidden Blade resolves its target is no longer "at a battlefield" → illegal target → the whole effect fails:
 *    the unit is not killed and nobody draws.
 * Rules: 355.11 (targets re-checked on resolution; illegal → no effect), 811 (a hidden card is played later as a Reaction for [0]).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/** P1's turn 3. P2 controls bf1 with a 2-Might Runner and has Fight or Flight hidden there; P1 holds Hidden Blade with 2 + [order]. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Runner" }, "runner")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .unit(P1, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, HIDDEN_BLADE, "hb");
}

describe("Ruling 3d4951350a95725f — Fight or Flight in response makes Hidden Blade's target illegal: no kill, no draw", () => {
  test("P1 Hidden-Blades the Runner; P2 flips the hidden Fight or Flight on it in response; FoF resolves first (Runner → base), then Hidden Blade fizzles — Runner lives and P2 draws nothing", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    const p1Hand = game.p1.hand().length;
    await game.p1.cast("hb", { targets: "runner" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["hb"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "fof")).toBe(true);
    await game.p2.reveal("fof", { answers: ["runner"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["hb", "fof"]);
    expect(game.p2.energy()).toBe(0); // played from hidden for [0]

    await game.settle();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("base"); // moved home, NOT killed
    expect(game.state("runner").damage).toBe(0);
    expect(game.zoneOf("hb")).toBe("trash"); // resolved (fizzled) — not refunded
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.p2.hand()).toHaveLength(p2Hand); // "its controller draws 2" never happens
    expect(game.p1.hand()).toHaveLength(p1Hand - 1); // and certainly not for the caster
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: unanswered, Hidden Blade kills the Runner and P2 (its controller) draws 2", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("hb", { targets: "runner" });
    await game.settle();
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
  });
});
