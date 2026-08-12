/**
 * Ruling b87f7cb802f6e502 — Last Stand (OGN-069 → ogn-069-298) · Action [3][calm]
 *   "Double a friendly unit's Might this turn. Give it [Temporary]."
 *
 * Q: When Last Stand doubles a unit's Might, does the damage already on it double too (i.e. is "HP" doubled)?
 * A: No. Only the Might value doubles; damage already marked on the unit stays exactly as it was. Might and
 *    damage are tracked separately — there is no HP. The unit dies when its damage reaches its (now doubled)
 *    Might.
 * Rules: 711/712 (Might is a characteristic; damage is a separate marked amount), 465.2.c.4 / state-based
 *        lethal check (damage ≥ Might ⇒ the unit dies).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LAST_STAND = "ogn-069-298";

/** A [1] Action "Deal N to a unit." for topping the damage up afterwards. */
const bolt = (amount: number) =>
  ({
    abilities: [{ effect: { amount, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
    cardType: "spell",
    domain: "fury",
    energyCost: 1,
    name: `Test Bolt (deal ${amount})`,
    timing: "action",
  }) as const;

/** P1's turn: a 3-Might Hero already carrying 2 damage, Last Stand + two bolts in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { calm: 1 } })
    .unit(P1, "base", { might: 3, name: "Hero" }, "hero", { damage: 2 })
    .hand(P1, LAST_STAND, "ls")
    .hand(P1, bolt(3), "bolt3")
    .hand(P1, bolt(4), "bolt4");
}

async function doubled(): Promise<Game> {
  const game = await board().build();
  expect(game.state("hero")).toMatchObject({ damage: 2, might: 3 });
  await game.p1.cast("ls", { targets: "hero" });
  await game.settle();
  return game;
}

describe("Ruling b87f7cb802f6e502 — Last Stand doubles Might only; marked damage is untouched", () => {
  test("ruling: 3 Might with 2 damage becomes 6 Might with 2 damage — the damage is NOT doubled", async () => {
    const game = await doubled();
    expect(game.state("hero").might).toBe(6);
    expect(game.state("hero").damage).toBe(2);
    expect(game.state("hero").baseMight).toBe(3);
  });

  test("ruling: it also grants [Temporary]", async () => {
    const game = await doubled();
    expect(game.state("hero").keywords).toContain("Temporary");
  });

  test("ruling: the unit dies when damage reaches the DOUBLED Might — 2 + 3 = 5 is not enough", async () => {
    const game = await doubled();
    await game.p1.cast("bolt3", { targets: "hero" });
    await game.settle();
    expect(game.state("hero").damage).toBe(5);
    expect(game.zoneOf("hero")).toBe("base"); // 5 < 6
  });

  test("ruling: … and 2 + 4 = 6 is: damage ≥ (doubled) Might kills it", async () => {
    const game = await doubled();
    await game.p1.cast("bolt4", { targets: "hero" });
    await game.settle();
    expect(game.zoneOf("hero")).toBe("trash");
  });

  test("contrast: without Last Stand the very same 3 damage is lethal on the 3-Might Hero (2 + 3 ≥ 3)", async () => {
    const game = await board().build();
    await game.p1.cast("bolt3", { targets: "hero" });
    await game.settle();
    expect(game.zoneOf("hero")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("ruling: 'this turn' — the doubling lapses at end of turn (the marked damage is healed there, as always)", async () => {
    const game = await doubled();
    expect(game.state("hero").might).toBe(6);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    // [Temporary] kills it at the start of ITS controller's Beginning Phase, so it is still here on P2's turn.
    expect(game.state("hero").might).toBe(3);
    expect(game.state("hero").damage).toBe(0); // rule 317.2 Expiration Step heals; nothing to do with Last Stand
  });
});
