/**
 * Ruling 2aa2c2bce1f8457f — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2] · Hidden
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Singularity (OGN-105 → ogn-105-298) · Spell · Mind · [6][mind][mind] — "Deal 6 to each of up to two units."
 *
 * Q: Can Zhonya's be "activated/used" when the opponent targets a unit that is at BASE (e.g. with Singularity)?
 * A: It is not activated at all — it is a mandatory replacement that applies whenever one of your units would die,
 *    wherever it is (base included). The unit is healed and exhausted; the "recall" does nothing for a unit already in
 *    base, but the death is still prevented. Played from hidden as a Reaction it just goes to base and waits for the
 *    next death anywhere.
 * Rules: 369–372 (replacement effects, mandatory), 811 (Hidden → Reaction; gear from hidden goes to base).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const SINGULARITY = "ogn-105-298";

/** P2's turn (turn 3). P1: 3-Might Squire in BASE + face-up Zhonya's in base. P2: Singularity with exactly [6][mind][mind]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .unit(P1, "base", { might: 3, name: "Squire" }, "squire")
    .gear(P1, ZHONYAS, "zhonyas")
    .hand(P2, SINGULARITY, "sing")
    .resources(P2, { energy: 6, power: { mind: 2 } });
}

describe("Ruling 2aa2c2bce1f8457f — Zhonya's replaces the death of a unit at BASE, with no activation", () => {
  test("Zhonya's offers P1 nothing to activate; Singularity's 6 on the base Squire is lethal → the Hourglass is killed instead, the Squire is healed (0 damage), exhausted, and stays in base — with no P1 decision at any point", async () => {
    const game = await board().build();
    expect(game.p1.legal().some((o) => o.card === "zhonyas")).toBe(false); // nothing to "activate"
    await game.p2.cast("sing", { targets: ["squire"] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    let p1Asked = false;
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
        continue;
      }
      p1Asked ||= d.seat === P1;
      break;
    }
    expect(p1Asked).toBe(false); // mandatory replacement — nobody chose anything
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.zoneOf("sing")).toBe("trash");
    expect(game.zoneOf("zhonyas")).toBe("trash"); // "kill this instead"
    expect(game.zoneOf("squire")).toBe("base"); // already in base: recall does nothing, death still prevented
    expect(game.state("squire")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p1.units()).toEqual(["squire"]);
    expect(game.violations()).toEqual([]);
  });

  test("from HIDDEN: P1 flips the facedown Hourglass as a Reaction to Singularity; it simply goes to P1's base, and when Singularity then resolves it replaces the base Squire's death exactly the same way", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 3, name: "Squire" }, "squire")
      .facedown(P1, "bf1", ZHONYAS, "zhonyas")
      .hand(P2, SINGULARITY, "sing")
      .resources(P2, { energy: 6, power: { mind: 2 } })
      .build();
    await game.p2.cast("sing", { targets: ["squire"] });
    await game.p2.passPriority();
    expect(game.p1.can("reveal", "zhonyas")).toBe(true);
    await game.p1.reveal("zhonyas");
    expect(game.p1.energy()).toBe(0); // played for [0] from hidden
    // A gear resolves at once (or after passes, engine permitting) and lands in base, waiting.
    for (let i = 0; i < 4 && game.zoneOf("zhonyas") !== "base"; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("zhonyas")).toBe("base");
    expect(game.state("zhonyas").isHidden).toBe(false);
    expect(game.zoneOf("sing")).toBe("chain"); // Singularity still waiting
    // Now let Singularity resolve.
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("sing")).toBe("trash");
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("base");
    expect(game.state("squire")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.state("holder").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("contrast: without an Hourglass the same Singularity kills the base Squire", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .unit(P1, "base", { might: 3, name: "Squire" }, "squire")
      .hand(P2, SINGULARITY, "sing")
      .resources(P2, { energy: 6, power: { mind: 2 } })
      .build();
    await game.p2.cast("sing", { targets: ["squire"] });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
  });
});
