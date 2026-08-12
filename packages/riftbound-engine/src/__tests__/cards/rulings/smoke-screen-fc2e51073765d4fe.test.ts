/**
 * Ruling fc2e51073765d4fe — Smoke Screen (OGN-093 → ogn-093-298) · Spell · [Reaction] · [2][mind]
 *   "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   × Scuttle Crab (UNL-053 → unl-053-219) · 0 Might "(Units with 0 [Might] can conquer and hold.)"
 *   × Hextech Ray (OGN-009 → ogn-009-298) · "Deal 3 to a unit at a battlefield."
 *
 * Q: Smoke Screen drops a unit to (near) nothing and she takes damage — if the reduction is then removed,
 *    is she still dead?
 * A: No. A unit does not die from having low/zero Might; it dies only when marked damage is at least its
 *    CURRENT Might at a state check. Restore the Might before that check and it lives; and a unit sitting at
 *    minimum Might with no damage marked is simply alive.
 * Rules: 432 (state check compares marked damage with current Might), 417.1 (damage is marked, not Might loss),
 *        716 / 517.2 ("this turn" Might modifiers, expiring in the Ending Phase).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const SCUTTLE_CRAB = "unl-053-219";
const HEXTECH_RAY = "ogn-009-298";

/** P1's turn. P2's 5-Might Fiore-analogue at bf1; P1 has Smoke Screen and a Hextech Ray. */
function board(damage = 0) {
  return scenario()
    .resources(P1, { energy: 5, power: { mind: 1, fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Duelist" }, "duelist", damage ? { damage } : undefined)
    .hand(P1, SMOKE_SCREEN, "smoke")
    .hand(P1, HEXTECH_RAY, "ray");
}

describe("Ruling fc2e51073765d4fe — low Might alone never kills; only damage ≥ current Might does", () => {
  test("ruling: an UNDAMAGED 5-Might unit reduced to the minimum by Smoke Screen does not die — it just sits there at 1 Might", async () => {
    const game = await board().build();
    await game.p1.cast("smoke", { targets: "duelist" });
    await game.settle();
    expect(game.state("duelist")).toMatchObject({ damage: 0, might: 1, baseMight: 5, mightModifier: -4 });
    expect(game.zoneOf("duelist")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("…and it dies only once damage is actually dealt while it is down there", async () => {
    const game = await board().build();
    await game.p1.cast("smoke", { targets: "duelist" });
    await game.settle();
    expect(game.zoneOf("duelist")).toBe("battlefield-bf1");
    await game.p1.cast("ray", { targets: "duelist" });
    await game.settle();
    expect(game.zoneOf("duelist")).toBe("trash");
  });

  test("a printed 0-[Might] unit (Scuttle Crab) with no damage marked is likewise ALIVE — zero Might is not death", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", SCUTTLE_CRAB, "crab")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    expect(game.state("crab")).toMatchObject({ damage: 0, might: 0 });
    expect(game.zoneOf("crab")).toBe("battlefield-bf1");
    await game.p1.cast("ray", { targets: "crab" }); // now it is dealt damage while at 0 Might
    await game.settle();
    expect(game.zoneOf("crab")).toBe("trash");
  });

  test("the 'save her' case: the -4 lasts only this turn — a unit that survived at reduced Might is back at full Might next turn", async () => {
    const game = await board().build();
    await game.p1.cast("smoke", { targets: "duelist" });
    await game.settle();
    expect(game.state("duelist").might).toBe(1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("duelist")).toMatchObject({ might: 5, mightModifier: 0, damage: 0 });
    expect(game.zoneOf("duelist")).toBe("battlefield-bf1");
  });

  test("contrast — damage marked BEFORE the reduction is re-checked and does kill (the reduction is what makes the old damage lethal)", async () => {
    const game = await board(3).build();
    expect(game.state("duelist")).toMatchObject({ damage: 3, might: 5 });
    await game.p1.cast("smoke", { targets: "duelist" });
    await game.settle();
    expect(game.zoneOf("duelist")).toBe("trash"); // 3 damage vs 1 Might
    expect(game.violations()).toEqual([]);
  });
});
