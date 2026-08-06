/**
 * Daring Poro — ogn-210-298 · Unit · Order · 2 energy · 2 Might · Poro
 *
 *   [Assault] (+1 [Might] while I'm an attacker.)
 *
 * Rule 807.1.c (Assault): "While I am an attacker, I have +X [Might]" (X omitted = 1).
 * Might is also the unit's survival stat, so an attacking Daring Poro needs 3 damage to die.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-210-298";

function attacking(defenderMight: number) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", CARD, "poro")
    .unit(P2, "bf1", { might: defenderMight }, "guard");
}

describe("Daring Poro (ogn-210-298)", () => {
  test("costs 2 energy, enters the base as a 2-Might unit with Assault; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "poro").build();
    await game.p1.play("poro");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.state("poro").might).toBe(2);
    expect(game.state("poro").keywords).toContain("Assault");
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "poro").build();
    expect(poor.p1.can("play", "poro")).toBe(false);
  });

  test("Assault: as an attacker it deals 3 — a 3-Might defender dies", async () => {
    const game = await attacking(3).build();
    await game.p1.move("poro", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.state("poro").combatRole).toBe("attacker");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash"); // 3 back ≥ 3
  });

  test("Assault — while attacking its current Might reads 3 (807.1.c, cf. 432.1.a)", async () => {
    // Expected: once designated attacker the Poro's Might is 2+1 = 3.
    // Actual: effective Might ignores Assault/Shield entirely and stays 2.
    const game = await attacking(3).build();
    await game.p1.move("poro", "bf1");
    expect(game.state("poro").combatRole).toBe("attacker");
    expect(game.state("poro").might).toBe(3);
  });

  test("Assault — a 3-Might attacker survives 2 combat damage from a 2-Might defender and conquers", async () => {
    // Expected: guard (2) dies to 3; Poro takes 2 < 3 and holds bf1 → P1 conquers.
    // Actual: the lethal threshold for attackers ignores Assault, so the Poro dies to 2 damage.
    const game = await attacking(2).build();
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("poro")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("poro").might).toBe(2); // bonus gone once combat is over
  });

  test("Assault does nothing while defending: a 2-Might attacker trades with it (2 vs 2)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "poro")
      .unit(P2, "base", { might: 2 }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("poro").combatRole).toBe("defender");
    expect(game.state("poro").might).toBe(2);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
  });
});
