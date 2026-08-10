/**
 * Ruling bd1b6a1168a4a485 — Grand Strategem (OGN-233 → ogn-233-298) · Spell · Order · [6][order][order][order] · [Action]
 *   "Give friendly units +5 [Might] this turn."
 *
 * Q: Does it also apply to units that enter play after it was cast, or only to units in play when it resolves?
 * A: Only the friendly units in play as it resolves get +5 (until end of turn). The spell is then in the trash and
 *    creates no lingering effect; units played afterwards get nothing. "This turn" is the buff's expiry, not a
 *    turn-long aura.
 * Rules: 359 (a spell's instructions are performed as it resolves, then it goes to trash), 317.2 (this-turn
 *        modifiers expire in the Expiration Step).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GRAND_STRATEGEM = "ogn-233-298";
const LATECOMER = { cardType: "unit", energyCost: 1, might: 2, name: "Latecomer" } as const;

/** P1's turn: two friendly units on the board (base + bf1), an enemy unit, Grand Strategem + a cheap unit in hand. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 7, power: { order: 3 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", { might: 2, name: "Veteran A" }, "a")
    .unit(P1, "bf1", { might: 3, name: "Veteran B" }, "b")
    .unit(P2, "base", { might: 4, name: "Enemy" }, "foe")
    .hand(P1, GRAND_STRATEGEM, "gs")
    .hand(P1, LATECOMER, "late");
}

describe("Ruling bd1b6a1168a4a485 — Grand Strategem buffs only the friendly units in play as it resolves", () => {
  test("resolves: every friendly unit currently in play gets +5 this turn (A 2→7, B 3→8), the enemy does not, and the spell is in the trash", async () => {
    const game = await board().build();
    await game.p1.cast("gs");
    await game.settle();
    expect(game.zoneOf("gs")).toBe("trash");
    expect(game.state("a")).toMatchObject({ baseMight: 2, might: 7, mightModifier: 5 });
    expect(game.state("b")).toMatchObject({ baseMight: 3, might: 8, mightModifier: 5 });
    expect(game.state("foe").might).toBe(4);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 0 } });
  });

  test("a unit played AFTER it resolved gets no bonus (Latecomer stays 2) while the earlier units keep their +5", async () => {
    const game = await board().build();
    await game.p1.cast("gs");
    await game.settle();
    await game.p1.play("late", { to: "base" });
    await game.settle();
    expect(game.zoneOf("late")).toBe("base");
    expect(game.state("late")).toMatchObject({ baseMight: 2, might: 2, mightModifier: 0 });
    expect(game.state("a").might).toBe(7);
    expect(game.state("b").might).toBe(8);
    expect(game.violations()).toEqual([]);
  });

  test("'this turn' is the expiry: after the turn ends A and B are back to 2 and 3", async () => {
    const game = await board().build();
    await game.p1.cast("gs");
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("a")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.state("b")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.trace().expiration[0]?.expired).toEqual(expect.arrayContaining(["mightModifier:a", "mightModifier:b"]));
  });
});
