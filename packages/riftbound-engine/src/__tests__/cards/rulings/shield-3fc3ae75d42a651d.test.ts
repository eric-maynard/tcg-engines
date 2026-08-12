/**
 * Ruling 3fc3ae75d42a651d — Shen, Kinkou (OGN-241 → ogn-241-298) · 3 Might ·
 *   "[Reaction] / [Shield 2] (+2 [Might] while I'm a defender.) / [Tank]".
 *
 * Q: Does [Shield] protect a unit that a spell damages outside of combat?
 * A: No. [Shield] is a passive that applies only while the unit is a defender — i.e. in combat. A spell
 *    that damages it outside combat meets its printed Might, so 3 damage kills a 3-Might Shen.
 * Rules: 806 ([Shield N]: +N Might while a defender), 464.2.c (defender designation exists only in a
 *        combat), 715 (effect damage), 320 / 323 (damage ≥ Might ⇒ dies).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SHEN = "ogn-241-298";

/** [Action] "Deal 3 to a unit." */
const BOLT3 = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt 3",
  rulesText: "[Action] Deal 3 to a unit.",
  timing: "action",
} as const;

describe("Ruling 3fc3ae75d42a651d — [Shield] is a combat-only bonus, so it does not blunt a spell outside combat", () => {
  test("in base, Shen is a plain 3 Might — [Shield 2] is printed but inactive", async () => {
    const game = await scenario().unit(P2, "base", SHEN, "shen").hand(P1, BOLT3, "bolt").build();
    expect(game.state("shen").keywords).toContain("Shield");
    expect(game.state("shen")).toMatchObject({ baseMight: 3, combatRole: null, might: 3 });
  });

  test("3 damage from a spell kills him outright — [Shield] does not add 2 to survive it", async () => {
    const game = await scenario().unit(P2, "base", SHEN, "shen").hand(P1, BOLT3, "bolt").build();
    await game.p1.cast("bolt", { targets: "shen" });
    await game.settle();
    expect(game.zoneOf("shen")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the same 3 damage while he IS a defender is survivable: the designation turns [Shield 2] on (3 → 5)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", SHEN, "shen")
      .unit(P1, "base", { might: 1, name: "Raider" }, "raider")
      .hand(P1, BOLT3, "bolt")
      .build();
    await game.p1.move("raider", "bf1");
    expect(game.state("shen")).toMatchObject({ combatRole: "defender", might: 5 });
    await game.p1.cast("bolt", { targets: "shen" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("shen")).toMatchObject({ damage: 3, might: 5, zone: "battlefield-bf1" });
  });

  test("and it lapses again the moment combat is over: healed by the Combat Cleanup, back to 3 Might in his base's terms", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", SHEN, "shen")
      .unit(P1, "base", { might: 1, name: "Raider" }, "raider")
      .build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("shen")).toBe("battlefield-bf1");
    expect(game.state("shen")).toMatchObject({ combatRole: null, damage: 0, might: 3 });
  });
});
