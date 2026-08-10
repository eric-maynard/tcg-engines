/**
 * Ruling 90bbfd6b7e9b7c68 — filed under Stupefy (OGN-095 → ogn-095-298, Reaction, 1: "Give a unit -1 [Might] this turn, to a
 *   minimum of 1 [Might]. Draw 1.") with Smoke Screen (ogn-093-298, -4 min 1) and Thousand-Tailed Watcher (ogn-116-298) named
 *   as the "real" Might reducers.
 *
 * Q: Does damage on a unit reduce its Might, or is damage tracked separately?
 * A: Separately. Marked damage never lowers Might: a 7-Might unit with 6 damage still has (and deals) 7. A unit dies when its
 *    marked damage ≥ its Might. Damage is healed in combat cleanup and at end of turn. Might-reducing effects (Stupefy, Smoke
 *    Screen, Watcher) are a different mechanic — they lower Might and leave damage alone.
 * Rules: 142 (damage is marked, compared against Might), 520 (dies at damage ≥ Might), 519 / 317.2 (heal in combat cleanup /
 *        Expiration Step), 476–478 (Might modifiers).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STUPEFY = "ogn-095-298";
const SMOKE_SCREEN = "ogn-093-298";

describe("Ruling 90bbfd6b7e9b7c68 — damage is not a Might reduction", () => {
  test("a 7-Might Brute carrying 6 damage still reads 7 Might and deals 7 in combat: attacking a fresh 7-Might Wall kills it (the Brute, taking 7 on top of 6, dies too)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 7, name: "Brute" }, "brute", { damage: 6 })
      .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall")
      .build();
    expect(game.state("brute")).toMatchObject({ baseMight: 7, damage: 6, might: 7 }); // NOT 1
    await game.p1.move("brute", "bf1");
    expect(game.state("brute")).toMatchObject({ combatRole: "attacker", might: 7 });
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash"); // took the full 7
    expect(game.zoneOf("brute")).toBe("trash"); // 6 + 7 ≥ 7
    expect(game.violations()).toEqual([]);
  });

  test("dies exactly when damage ≥ Might, and combat cleanup heals survivors: a fresh 7-Might Brute into a 6-Might Guard — Guard (7 dmg) dies, Brute survives with its 6 damage HEALED to 0 and conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 7, name: "Brute" }, "brute")
      .unit(P2, "bf1", { might: 6, name: "Guard" }, "guard")
      .build();
    await game.p1.move("brute", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.state("brute")).toMatchObject({ damage: 0, might: 7, zone: "battlefield-bf1" }); // 6 < 7 survived, then healed
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("end of turn heals too: a unit sitting in base with 6 damage has 0 damage (and unchanged 7 Might) once the turn ends", async () => {
    const game = await scenario()
      .unit(P1, "base", { might: 7, name: "Brute" }, "brute", { damage: 6 })
      .build();
    expect(game.state("brute")).toMatchObject({ damage: 6, might: 7 });
    await game.advanceTurn();
    expect(game.state("brute")).toMatchObject({ damage: 0, might: 7 });
    expect(game.trace().expiration[0]?.healed ?? []).toContain("brute");
  });

  test("Might reduction is the separate mechanic: Stupefy on the 6-damage 7-Might Brute lowers its MIGHT to 6 (damage untouched at 6) — and now 6 ≥ 6 kills it; P2 draws 1", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 7, name: "Brute" }, "brute", { damage: 6 })
      .hand(P2, STUPEFY, "stupefy")
      .deck(P2, ["ogn-175-298"], ["p2top"])
      .build();
    expect(game.state("brute")).toMatchObject({ damage: 6, might: 7 });
    await game.p2.cast("stupefy", { targets: "brute" });
    await game.settle();
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.p2.hand()).toContain("p2top");
    expect(game.zoneOf("brute")).toBe("trash"); // Might 6 vs 6 damage
    expect(game.violations()).toEqual([]);
  });

  test("…whereas Smoke Screen on an UNDAMAGED 7-Might unit just makes it a 3-Might unit with 0 damage (alive) — reduction and damage are independent ledgers", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { mind: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 7, name: "Brute" }, "brute")
      .hand(P2, SMOKE_SCREEN, "smoke")
      .build();
    await game.p2.cast("smoke", { targets: "brute" });
    await game.settle();
    expect(game.state("brute")).toMatchObject({ baseMight: 7, damage: 0, might: 3, mightModifier: -4, zone: "battlefield-bf1" });
  });
});
