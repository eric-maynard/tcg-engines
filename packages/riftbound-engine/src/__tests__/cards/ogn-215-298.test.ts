/**
 * Petty Officer — ogn-215-298 · Unit · Order · 5 energy · 5 Might
 *
 *   [Assault] (+1 [Might] while I'm an attacker.)
 *
 * Rules: 807 (Assault N: +N Might while attacking — Might is both the damage
 * dealt and the lethal-damage threshold; 807.2 stacking example is this very card + Cleave), 626–627 (combat).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-215-298";
const CLEAVE = "ogn-004-298"; // 1 energy: give a unit Assault 3 this turn

describe("Petty Officer (ogn-215-298)", () => {
  test("costs 5 energy (no power); a 5-Might unit with Assault; unaffordable with 4", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "po").build();
    await game.p1.play("po");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("po")).toBe("base");
    expect(game.state("po").might).toBe(5);
    expect(game.state("po").keywords).toContain("Assault");
    const poor = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "po").build();
    expect(poor.p1.can("play", "po")).toBe(false);
  });

  test("Assault: as an attacker it deals 6 — a 6-Might defender dies (and trades with it)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "po")
      .unit(P2, "bf1", { might: 6 }, "def6")
      .build();
    expect(game.state("po").might).toBe(5); // no bonus outside combat
    await game.p1.move("po", "bf1");
    await game.settle();
    expect(game.zoneOf("def6")).toBe("trash");
    expect(game.zoneOf("po")).toBe("trash"); // took 6 ≥ 6
  });

  test("Assault also raises its own lethal threshold — attacking a 5-Might defender it survives (6 vs 5 damage) and conquers", async () => {
    // Expected (807, 627): attacker has 6 Might during combat, takes 5 → lives, defender dies, P1 conquers bf1.
    // Actual: the engine compares incoming damage against printed Might, so both units die and nobody conquers.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "po")
      .unit(P2, "bf1", { might: 5 }, "def5")
      .build();
    await game.p1.move("po", "bf1");
    await game.settle();
    expect(game.zoneOf("def5")).toBe("trash");
    expect(game.locationOf("po")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("po").might).toBe(5); // bonus gone after combat
  });

  test("Assault stacks (807.2): Cleave's Assault 3 + printed Assault = Assault 4 → deals 9 as an attacker", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "po")
      .unit(P2, "bf1", { might: 9 }, "def9")
      .hand(P1, CLEAVE, "cleave")
      .build();
    await game.p1.cast("cleave", { targets: "po" });
    await game.settle();
    await game.p1.move("po", "bf1");
    await game.settle();
    expect(game.zoneOf("def9")).toBe("trash");
  });

  test("no bonus while DEFENDING: a 5-Might attacker trades evenly with it", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "po")
      .unit(P2, "base", { might: 5 }, "atk5")
      .build();
    await game.p2.move("atk5", "bf1");
    await game.settle();
    expect(game.zoneOf("po")).toBe("trash");
    expect(game.zoneOf("atk5")).toBe("trash");
  });
});
