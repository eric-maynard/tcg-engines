/**
 * Facebreaker — ogn-220-298 · Spell (Action) · Order · 2 energy
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   [Action] (Play on your turn or in showdowns.)
 *   Stun a friendly unit and an enemy unit at the same battlefield. (They don't deal combat
 *   damage this turn.)
 *
 * Rule 811 (Hidden): hide for [rainbow] at a battlefield you control; from the next turn it
 * has Reaction and plays from facedown ignoring its cost, targets restricted to that battlefield.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const FACEBREAKER = "ogn-220-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Mine" }, "mine")
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .unit(P2, "bf2", { might: 3, name: "Far" }, "far")
    .unit(P1, "base", { might: 1 }, "home")
    .unit(P2, "base", { might: 1 }, "theirHome")
    .hand(P1, FACEBREAKER, "fb");
}

describe("Facebreaker (ogn-220-298)", () => {
  test("costs 2 energy; stuns the chosen friendly unit and enemy unit at the same battlefield; spell → trash", async () => {
    const game = await board().build();
    await game.p1.cast("fb", { targets: ["mine", "foe"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("mine").isStunned).toBe(true);
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.state("far").isStunned).toBe(false);
    expect(game.zoneOf("fb")).toBe("trash");
    const poor = await board().resources(P1, { energy: 1 }).build();
    expect(poor.p1.can("cast", "fb")).toBe(false);
  });

  test.failing("BUG: the enemy unit must be at the SAME battlefield as the friendly one (units in base / other battlefields are not legal)", async () => {
    // Expected: only the pair [mine, foe] is legal. Actual: [mine, far] (enemy at bf2) is offered too.
    const game = await board().build();
    const pairs = game.p1.option("cast", "fb")?.fields.find((f) => f.arg === "targets")?.options;
    expect(pairs).toEqual([["mine", "foe"]]);
    const t = await game.p1.try((p) => p.cast("fb", { targets: ["mine", "far"] }));
    expect(t.ok).toBe(false);
  });

  test("base units are never legal (friendly or enemy)", async () => {
    const game = await board().build();
    const pairs = (game.p1.option("cast", "fb")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
    expect(pairs.flat()).not.toContain("home");
    expect(pairs.flat()).not.toContain("theirHome");
    const t = await game.p1.try((p) => p.cast("fb", { targets: ["home", "theirHome"] }));
    expect(t.ok).toBe(false);
  });

  test("stunned units deal no combat damage this turn — the following combat leaves both undamaged (rule 423.1.b)", async () => {
    // Expected: neither stunned unit deals combat damage, so both survive with 0 damage and the
    // attacker is recalled (466.1.a.2). Actual: the stunned 3-Might defender still kills "mine".
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "mine")
      .unit(P2, "bf1", { might: 3 }, "foe")
      .hand(P1, FACEBREAKER, "fb")
      .build();
    await game.p1.move("mine", "bf1"); // showdown opens, P1 has focus
    await game.p1.cast("fb", { targets: ["mine", "foe"] });
    await game.settle();
    expect(game.zoneOf("mine")).not.toBe("trash");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.state("foe").damage).toBe(0);
    expect(game.state("mine").damage).toBe(0);
    expect(game.locationOf("mine")).toBe("base"); // attacker recalled, defender held (rule 466.1.a.2)
  });

  test("Action: not castable from hand on the opponent's turn outside a showdown", async () => {
    const game = await board().active(P2).build();
    expect(game.p1.can("cast", "fb")).toBe(false);
  });

  test("Hidden: hide for [rainbow] at a battlefield you control (not the turn it is hidden)", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "holder")
      .hand(P1, FACEBREAKER, "fb")
      .build();
    await game.p1.hide("fb", "bf1");
    expect(game.p1.resources().power).toEqual({ rainbow: 0 });
    expect(game.zoneOf("fb")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "fb")).toBe(false);
  });

  test("Hidden: on a later turn it plays from facedown for 0 as a Reaction during the opponent's attack there", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "holder")
      .unit(P2, "base", { might: 5 }, "attacker")
      .hand(P1, FACEBREAKER, "fb")
      .build();
    await game.p1.hide("fb", "bf1");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.move("attacker", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "fb")).toBe(true);
    await game.p1.reveal("fb");
    expect(game.p1.energy()).toBe(0); // played for 0
    expect(game.p1.power()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fb", controller: P1 })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("holder", "attacker");
    }
    expect(game.zoneOf("fb")).toBe("trash");
    expect(game.state("holder").isStunned).toBe(true);
    expect(game.state("attacker").isStunned).toBe(true);
  });
});
