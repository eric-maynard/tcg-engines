/**
 * Ruling 935f4cfeedb02e02 — Eager Apprentice (OGN-084 → ogn-084-298, 3 Might: "While I'm at a battlefield, the Energy
 *   costs for spells you play is reduced by [1], to a minimum of [1].") × Vex, Cheerless (SFD-146 → sfd-146-221, 5 Might:
 *   "While I'm in combat, friendly spells cost [1][rainbow] less to a minimum of [1], and enemy spells cost [1][rainbow]
 *   more.")
 *
 * Q: Does Apprentice's discount offset Vex's Energy increase, even on a 1-Energy spell?
 * A: Yes for the Energy part: increases apply before discounts (353.3 → 353.4). 1E spell → Vex: 2E + 1 power → Apprentice:
 *    −1E (min 1) → final 1E + 1 power. Apprentice never touches the added Power.
 * Rules: 353 (determine total cost: increases, then reductions; 353.4.c minimums).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EAGER_APPRENTICE = "ogn-084-298";
const VEX = "sfd-146-221";
const STUPEFY = "ogn-095-298"; // Reaction, [1], no power: "Give a unit -1 [Might] this turn, to a minimum of 1. Draw 1."

/**
 * P1's turn. P2's Vex (5) holds bf1; P1's Charger (6) attacks it so Vex is IN COMBAT. Optionally P1's Eager Apprentice
 * stands at P1's bf2. P1 holds Stupefy with the given pool.
 */
async function inCombat(pool: { energy: number; rainbow: number }, withApprentice: boolean): Promise<Game> {
  let b = scenario()
    .resources(P1, { energy: pool.energy, power: { rainbow: pool.rainbow } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", VEX, "vex")
    .unit(P1, "base", { might: 6, name: "Charger" }, "charger")
    .hand(P1, STUPEFY, "stupefy");
  if (withApprentice) {
    b = b.unit(P1, "bf2", EAGER_APPRENTICE, "apprentice");
  }
  const game = await b.build();
  await game.p1.move("charger", "bf1");
  expect(game.state("vex").combatRole).toBe("defender"); // "while I'm in combat"
  // drain any initial-chain items until P1 holds Focus/priority and may cast
  for (let i = 0; i < 6 && !(game.actingSeat() === P1 && game.decision()?.kind === "action"); i++) {
    await game.settle({ maxSteps: 1 });
  }
  return game;
}

describe("Ruling 935f4cfeedb02e02 — Vex's +[1][rainbow] is applied first, then Eager Apprentice's −[1] (min 1): a 1-cost spell costs 1E + 1 power", () => {
  test("baseline (no Apprentice): against Vex in combat, Stupefy costs 2 Energy + 1 power — [1]+1 rainbow is NOT enough, [2]+1 rainbow is", async () => {
    const poor = await inCombat({ energy: 1, rainbow: 1 }, false);
    expect(poor.p1.can("cast", "stupefy")).toBe(false);
    const rich = await inCombat({ energy: 2, rainbow: 1 }, false);
    expect(rich.p1.can("cast", "stupefy")).toBe(true);
    await rich.p1.cast("stupefy", { targets: "vex" });
    expect(rich.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // paid 2E + 1 power
  });

  // rule 353.3 → 353.4: Vex's increase joins the total cost first, then Apprentice's −[1] (min 1) applies to it → 1E + 1P.
  test("ruling 935f4cfeedb02e02 — with Apprentice + Vex a 1-cost spell costs 1E+1P (increase first, then the discount)", async () => {
    const game = await inCombat({ energy: 1, rainbow: 1 }, true);
    expect(game.locationOf("apprentice")).toBe("bf2");
    expect(game.p1.can("cast", "stupefy")).toBe(true);
    await game.p1.cast("stupefy", { targets: "vex" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "stupefy", targets: ["vex"] })]);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.state("vex").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });

  test("the Energy floor and the Power surcharge both hold: with Apprentice, [1] energy but NO power cannot pay (Vex's added power remains), and 0 energy + 1 power cannot pay either (minimum [1])", async () => {
    const noPower = await inCombat({ energy: 1, rainbow: 0 }, true);
    expect(noPower.p1.can("cast", "stupefy")).toBe(false);
    const noEnergy = await inCombat({ energy: 0, rainbow: 1 }, true);
    expect(noEnergy.p1.can("cast", "stupefy")).toBe(false);
  });
});
