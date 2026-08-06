/**
 * Lux, Illuminated — ogs-006-024 · Champion Unit · Mind · 6 energy + [mind] · 5 Might
 *
 *   When you play a spell that costs [5] or more, give me +3 [Might] this turn.
 *
 * Rules: 359.3.e.10 ("when you play a spell" abilities trigger as the spell RESOLVES), 206
 * (cost checks use the PRINTED cost — the rule's own example is Lux + Sky Splitter; [5] is an
 * Energy amount), "this turn" expires at end of turn, "you" = only its controller's spells.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogs-006-024";
/** Inline vanilla "Draw 1" Action spell of a given printed energy cost. */
const drawSpell = (cost: number, power: string[] = []) => ({
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: cost,
  name: `Draw for ${cost}`,
  powerCost: power,
  timing: "action",
});

function withLux(energy = 7) {
  return scenario().resources(P1, { energy, power: { mind: 2 } }).unit(P1, "base", CARD, "lux");
}

describe("Lux, Illuminated (ogs-006-024)", () => {
  test("costs 6 energy + 1 mind from hand; a 5-Might champion unit; unaffordable short of either", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { mind: 1 } }).hand(P1, CARD, "lux").build();
    await game.p1.play("lux");
    await game.settle();
    expect(game.zoneOf("lux")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.state("lux").might).toBe(5);
    const noPower = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "lux").build();
    expect(noPower.p1.can("play", "lux")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 5, power: { mind: 1 } }).hand(P1, CARD, "lux").build();
    expect(lowEnergy.p1.can("play", "lux")).toBe(false);
  });

  test("playing a 5-cost spell: as it resolves Lux's trigger goes on the chain, then she is 8 Might", async () => {
    const game = await withLux().hand(P1, drawSpell(5), "big").build();
    await game.p1.cast("big");
    expect(game.state("lux").might).toBe(5); // not yet — triggers as the spell resolves (359.3.e.10)
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lux", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("lux").might).toBe(8);
    expect(game.state("lux").baseMight).toBe(5);
  });

  test("'or more' and printed cost (206): a 7-cost spell also triggers; two qualifying spells stack to 11", async () => {
    const game = await withLux(12).hand(P1, drawSpell(7), "seven").hand(P1, drawSpell(5), "five").build();
    await game.p1.cast("seven");
    await game.settle();
    expect(game.state("lux").might).toBe(8);
    await game.p1.cast("five");
    await game.settle();
    expect(game.state("lux").might).toBe(11);
  });

  test("'this turn': the bonus is gone on the next turn", async () => {
    const game = await withLux().hand(P1, drawSpell(5), "big").build();
    await game.p1.cast("big");
    await game.settle();
    expect(game.state("lux").might).toBe(8);
    await game.advanceTurn();
    expect(game.state("lux").might).toBe(5);
  });

  test.failing("BUG: a spell costing less than [5] does NOT trigger her (4 energy, even with 2 power on top)", async () => {
    // Expected: [5] is a printed-Energy threshold; a 2-cost spell and a 4-energy+2-power spell leave
    // Lux at 5 Might. Actual: the parsed trigger has no cost condition, so any spell gives +3.
    const game = await withLux(6).hand(P1, drawSpell(2), "cheap").hand(P1, drawSpell(4, ["mind", "mind"]), "four").build();
    await game.p1.cast("cheap");
    await game.settle();
    expect(game.state("lux").might).toBe(5);
    await game.p1.cast("four");
    await game.settle();
    expect(game.state("lux").might).toBe(5);
  });

  test("'you play': an opponent's 5-cost spell does not trigger her", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 5 })
      .unit(P1, "base", CARD, "lux")
      .hand(P2, drawSpell(5), "theirs")
      .build();
    await game.p2.cast("theirs");
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.state("lux").might).toBe(5);
  });
});
