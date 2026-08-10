/**
 * Ruling 657d422a0e9d3024 — Back to Back (OGN-206 → ogn-206-298) · Reaction [3] "Give two friendly units each +2 [Might] this turn."
 *   × Beast Below (SFD-132 → sfd-132-221) · [7][chaos][chaos] · 8 Might "When you play me, return another friendly unit and an
 *     enemy unit to their owners' hands."
 *
 * Q: With too few valid targets, what is the difference between the two? Can Beast Below be played with only one friendly unit?
 * A: Back to Back cannot be played from hand at all without 2 friendly units (all targets must be chosen at play). Beast Below
 *    CAN be played as a unit; its trigger then tries to go on the chain, but lacking valid choices for ALL its targets (another
 *    friendly unit AND an enemy unit) it never enters the chain. "Do as much as you can" only applies at resolution.
 * Rules: 355.8 (must choose every required target to finalize), 383.2 (trigger with no legal targets is removed), 359.3 (DAMAYC).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BACK_TO_BACK = "ogn-206-298";
const BEAST_BELOW = "sfd-132-221";

describe("Ruling 657d422a0e9d3024 — Back to Back needs both targets to be CAST; Beast Below is played regardless, its trigger just doesn't happen", () => {
  // Expected (ruling, 355.8): with a single friendly unit Back to Back cannot be played at all — both targets must be
  // chosen to finalize it. Actual: the engine offers a one-target cast ({targets:["loner"]}), lets it resolve and gives
  // the lone unit +2.
  test("ruling 657d422a0e9d3024 — engine lets Back to Back be cast with only ONE friendly unit (should be unplayable)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Loner" }, "loner")
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
      .hand(P1, BACK_TO_BACK, "btb")
      .build();
    expect(game.p1.can("cast", "btb")).toBe(false);
    const one = await game.p1.try((p) => p.cast("btb", { targets: "loner" }));
    expect(one.ok).toBe(false);
    const withFoe = await game.p1.try((p) => p.cast("btb", { targets: ["loner", "foe"] }));
    expect(withFoe.ok).toBe(false);
    expect(game.zoneOf("btb")).toBe("hand");
    expect(game.p1.energy()).toBe(3);
    expect(game.chain()).toEqual([]);
    expect(game.state("loner").might).toBe(2);
  });

  test("contrast: with TWO friendly units Back to Back is castable and buffs both", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Loner" }, "loner")
      .unit(P1, "base", { might: 1, name: "Buddy" }, "buddy")
      .hand(P1, BACK_TO_BACK, "btb")
      .build();
    expect(game.p1.can("cast", "btb")).toBe(true);
    await game.p1.cast("btb", { targets: ["loner", "buddy"] });
    await game.settle();
    expect(game.state("loner").might).toBe(4);
    expect(game.state("buddy").might).toBe(3);
  });

  test("Beast Below with NO other friendly unit (an enemy exists): the unit is played and stays; its trigger never enters the chain; the enemy is untouched", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
      .hand(P1, BEAST_BELOW, "beast")
      .build();
    expect(game.p1.can("play", "beast")).toBe(true);
    await game.p1.play("beast", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("beast")).toBe("base");
    expect(game.chain()).toEqual([]); // removed as a pending item — nothing to respond to
    expect(game.decision()?.kind).not.toBe("pick"); // nobody is asked for partial targets
    await game.settle();
    expect(game.zoneOf("beast")).toBe("base");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1"); // no "do as much as you can" bounce
    expect(game.p2.hand()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Beast Below with one other friendly unit but NO enemy unit: same — played, no trigger on the chain, the friend stays", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Pal" }, "pal")
      .hand(P1, BEAST_BELOW, "beast")
      .build();
    await game.p1.play("beast", { to: "base" });
    expect(game.zoneOf("beast")).toBe("base");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("pal")).toBe("battlefield-bf1");
    expect(game.p1.hand()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: with another friendly unit AND an enemy unit, the trigger DOES go on the chain naming both, and bounces them", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
      .unit(P1, "bf2", { might: 2, name: "Pal" }, "pal")
      .hand(P1, BEAST_BELOW, "beast")
      .build();
    await game.p1.play("beast", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "beast", targets: ["pal", "foe"], triggered: true })]);
    await game.settle();
    expect(game.zoneOf("pal")).toBe("hand");
    expect(game.zoneOf("foe")).toBe("hand");
    expect(game.zoneOf("beast")).toBe("base");
  });
});
