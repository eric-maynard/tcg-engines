/**
 * Defy — ogn-045-298 · Spell · Calm · 1 energy + 1 calm power
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Counter a spell that costs no more than [4] and no more than [rainbow].
 *
 * Rule 206: the restriction checks the target's PRINTED cost — Energy cost ≤ 4
 * and Power cost ≤ 1.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-045-298";

function bolt(name: string, energyCost: number, powerCost: string[] = []) {
  return {
    abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
    cardType: "spell",
    domain: "fury",
    energyCost,
    name,
    powerCost,
    timing: "action",
  };
}
const SMALL = bolt("Small Bolt", 4, ["fury"]); // 4 energy + 1 power: the most expensive legal target
const BIG_ENERGY = bolt("Big Bolt", 5); // 5 energy: too much energy
const BIG_POWER = bolt("Twin-Power Bolt", 2, ["fury", "fury"]); // 2 power: too much power

/** P2's turn; P2 has just put `spell` on the chain targeting P1's unit and passed priority to P1. */
async function facing(spell: object) {
  const game = await scenario()
    .active(P2)
    .resources(P2, { energy: 7, power: { fury: 3 } })
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .unit(P1, "base", { might: 9 }, "mine")
    .hand(P2, spell, "spell")
    .hand(P1, CARD, "defy")
    .build();
  await game.p2.cast("spell", { targets: "mine" });
  await game.p2.passPriority();
  return game;
}

describe("Defy (ogn-045-298)", () => {
  test("[Reaction] on the opponent's turn: counters a 4-energy/1-power spell; pays 1 energy + 1 calm; both spells end in trash", async () => {
    const game = await facing(SMALL);
    expect(game.p1.can("cast", "defy")).toBe(true);
    await game.p1.cast("defy");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["spell", "defy"]);
    await game.settle();
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.state("mine").damage).toBe(0); // countered: no damage dealt
  });

  test("not castable with no spell on the chain (rule 355.8)", async () => {
    const game = await scenario().resources(P1, { energy: 1, power: { calm: 1 } }).hand(P1, CARD, "defy").build();
    expect(game.p1.can("cast", "defy")).toBe(false);
  });

  test("cost: unaffordable without the calm power or with 0 energy", async () => {
    for (const pool of [{ energy: 1 }, { energy: 0, power: { calm: 1 } }]) {
      const game = await scenario()
        .active(P2)
        .resources(P2, { energy: 4, power: { fury: 1 } })
        .resources(P1, pool)
        .unit(P1, "base", { might: 9 }, "mine")
        .hand(P2, SMALL, "spell")
        .hand(P1, CARD, "defy")
        .build();
      await game.p2.cast("spell", { targets: "mine" });
      await game.p2.passPriority();
      expect(game.p1.can("cast", "defy")).toBe(false);
    }
  });

  test("cannot counter a spell whose Energy cost is more than 4", async () => {
    // A 5-energy spell is not a legal target, so with it as the only spell Defy is not castable
    // and the bolt resolves for 2.
    const game = await facing(BIG_ENERGY);
    expect(game.p1.can("cast", "defy")).toBe(false);
    await game.settle();
    expect(game.state("mine").damage).toBe(2);
  });

  test("cannot counter a spell whose Power cost is more than 1", async () => {
    // A 2-power spell is not a legal target.
    const game = await facing(BIG_POWER);
    expect(game.p1.can("cast", "defy")).toBe(false);
    await game.settle();
    expect(game.state("mine").damage).toBe(2);
  });
});
