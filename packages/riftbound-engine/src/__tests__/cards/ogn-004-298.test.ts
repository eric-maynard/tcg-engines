/**
 * Cleave — ogn-004-298 · Spell · Fury · 1 energy
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Give a unit [Assault 3] this turn. (+3 [Might] while it's an attacker.)
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CLEAVE = "ogn-004-298";

describe("Cleave (ogn-004-298)", () => {
  test("costs 1 energy, targets any unit (friendly or enemy), grants Assault 3, then goes to trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf1", { might: 3 }, "foe")
      .hand(P1, CLEAVE, "cleave")
      .build();

    // Both units are legal targets.
    const targets = game.p1.option("cast", "cleave")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["ally"], ["foe"]]));

    await game.p1.cast("cleave", { targets: "ally" });
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("cleave")).toBe("chain");
    await game.settle(); // both players pass priority → resolves

    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("ally").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("ally").keywords).toContain("Assault");
    expect(game.state("foe").grantedKeywords).toEqual([]);
    // Assault only matters while attacking: might at rest is unchanged.
    expect(game.state("ally").might).toBe(2);
  });

  test("'this turn': the granted Assault expires when the turn ends", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, CLEAVE, "cleave")
      .build();
    await game.p1.cast("cleave", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").keywords).toContain("Assault");
    await game.advanceTurn();
    expect(game.state("ally").grantedKeywords).toEqual([]);
    expect(game.state("ally").keywords).not.toContain("Assault");
  });

  test("+3 Might while attacking: a 2-Might attacker with Cleave kills a 4-Might defender", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf1", { might: 4 }, "foe")
      .hand(P1, CLEAVE, "cleave")
      .build();
    await game.p1.cast("cleave", { targets: "ally" });
    await game.settle();
    await game.p1.move("ally", "bf1"); // opens the combat showdown
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.settle(); // both pass focus → combat damage step runs automatically
    expect(game.zoneOf("foe")).toBe("trash"); // 2 + 3 = 5 ≥ 4
  });

  test("the Assault-boosted attacker survives non-lethal return damage and conquers (rules 719.1.c, 626.1.d.1.a, 627.1/627.3)", async () => {
    // 2 (+3 Assault) = 5 Might attacker takes 4 damage from the defender: 4 < 5 is not Lethal Damage,
    // so it must remain, conquer bf1 and have its damage cleared (627.5). The engine's combat
    // resolver counts Shield toward a defender's lethal threshold but ignores Assault for attackers,
    // so "ally" is killed and nobody conquers.
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf1", { might: 4 }, "foe")
      .hand(P1, CLEAVE, "cleave")
      .build();
    await game.p1.cast("cleave", { targets: "ally" });
    await game.settle();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.state("ally").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("[Action] timing: playable with Focus during a showdown, not onto an open chain, not on the opponent's turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf1", { might: 9 }, "wall")
      .hand(P1, CLEAVE, "c1")
      .hand(P1, CLEAVE, "c2")
      .build();
    await game.p1.move("ally", "bf1");
    const showdown = game.decision() as ActionDecision;
    expect(showdown.context).toBe("showdown");
    expect(showdown.seat).toBe(P1); // attacker holds Focus first
    expect(game.p1.can("cast", "c1")).toBe(true);

    await game.p1.cast("c1", { targets: "ally" });
    expect((game.decision() as ActionDecision).context).toBe("chain");
    // An Action spell cannot be added to an existing chain (only Reactions can).
    expect(game.p1.can("cast", "c2")).toBe(false);

    const oppTurn = await scenario().active(P2).resources(P1, { energy: 1 }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CLEAVE, "c").build();
    expect(oppTurn.p1.can("cast", "c")).toBe(false);
    const err = await oppTurn.p1.try((p) => p.cast("c", { targets: "ally" }));
    expect(err.ok).toBe(false);
  });

  test("not playable without a unit to target or without 1 energy", async () => {
    const noTarget = await scenario().resources(P1, { energy: 1 }).hand(P1, CLEAVE, "c").build();
    expect(noTarget.p1.can("cast", "c")).toBe(false);
    const noEnergy = await scenario().unit(P1, "base", { might: 1 }, "u").hand(P1, CLEAVE, "c").build();
    expect(noEnergy.p1.can("cast", "c")).toBe(false);
    await noEnergy.p1.do("addResources", { energy: 1 });
    expect(noEnergy.p1.can("cast", "c")).toBe(true);
  });
});
