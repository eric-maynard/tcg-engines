/**
 * Ruling e8bb59fcc07e1a94 — Gold token (SFD-T03 → sfd-t03) · Gear token
 *   "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]. (Abilities that add resources can't be reacted to.)"
 *
 * Q: Can a Gold token add 1 resource (energy), or does it only give power?
 * A: Gold only ever adds POWER ([rainbow]). It cannot be used to add energy/resources to a card's cost.
 * Rules: 206 (energy vs power are distinct resources), 421.6 / "[Add]" abilities, 428.1 (Kill this = its cost).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const GOLD = "sfd-t03";

/** A [1] spell (energy only) and a [rainbow] spell — the two things power can and cannot pay for. */
const ENERGY_SPELL = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Costs One Energy",
} as const;

const POWER_SPELL = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Costs One Rainbow",
  powerCost: ["rainbow"],
} as const;

/** P1's turn, completely empty pools, one Gold token in play, both spells in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 0, power: {} })
    .gear(P1, GOLD, "gold")
    .hand(P1, ENERGY_SPELL, "energySpell")
    .hand(P1, POWER_SPELL, "powerSpell");
}

describe("Ruling e8bb59fcc07e1a94 — a Gold token adds power only, never energy", () => {
  test("premise: with empty pools neither spell is castable", async () => {
    const game = await board().build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.can("cast", "energySpell")).toBe(false);
    expect(game.p1.can("cast", "powerSpell")).toBe(false);
  });

  test("cashing the Gold in adds exactly 1 [rainbow] POWER and 0 energy; the token is killed", async () => {
    const game = await board().build();
    await game.p1.activate("gold");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.zoneOf("gold")).not.toBe("base"); // "Kill this" is part of the cost
  });

  test("that power pays a [rainbow] cost …", async () => {
    const game = await board().build();
    await game.p1.activate("gold");
    await game.settle();
    expect(game.p1.can("cast", "powerSpell")).toBe(true);
    await game.p1.cast("powerSpell");
    await game.settle();
    expect(game.zoneOf("powerSpell")).toBe("trash");
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("… but it does NOT pay an energy cost: the [1] spell is still uncastable after the Gold is spent", async () => {
    const game = await board().build();
    await game.p1.activate("gold");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("cast", "energySpell")).toBe(false);
    const r = await game.p1.try((p) => p.cast("energySpell"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("energySpell")).toBe("hand");
    expect(game.p1.power("rainbow")).toBe(1); // the power sat there unusable for an energy cost
  });
});
