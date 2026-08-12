/**
 * Ruling 38e20d56f35ad5b1 — Nine-Tailed Fox (OGN-255 → ogn-255-298) · Legend (Ahri)
 *   "When an enemy unit attacks a battlefield you control, give it -1 [Might] this turn, to a minimum of 1."
 *   × Dragon's Rage (OGN-258 → ogn-258-298) · Spell · [4][rainbow] "Move an enemy unit. Then do this: Choose
 *     another enemy unit at its destination. They deal damage equal to their Mights to each other."
 *
 * Q: When a unit is moved by Dragon's Rage onto a battlefield with the Ahri legend, does the attack/showdown
 *    trigger resolve first, or the legend's -1?
 * A: Neither — Dragon's Rage resolves ENTIRELY first. Everything it sets off (the showdown, the legend's -1)
 *    is only queued while the spell is resolving and goes on the chain afterwards.
 * Rules: 340 (a chain item resolves fully before anything else), 383.3 (triggers queue during resolution and are
 *        put on the chain after it), 355.4 (a chosen move destination).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NINE_TAILED_FOX = "ogn-255-298";
const DRAGONS_RAGE = "ogn-258-298";

/** P1's turn. P1's legend is Ahri and P1 holds bf1 with a 9-Might Guard; P2 has a Raider (4) and a Squire in base. */
function board() {
  return scenario()
    .legend(P1, NINE_TAILED_FOX, "ahri")
    .resources(P1, { energy: 4, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 9, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 3, name: "Squire" }, "squire")
    .hand(P1, DRAGONS_RAGE, "rage");
}

/** Cast Dragon's Rage on the Raider and let it resolve, sending him into P1's bf1. */
async function ragedIntoBf1(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("rage", { targets: ["raider"] });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // the destination is chosen as the spell resolves
  await game.p1.pick("bf1");
  return game;
}

describe("Ruling 38e20d56f35ad5b1 — Dragon's Rage finishes resolving before the legend's -1 or the showdown triggers do", () => {
  test("while Dragon's Rage is on the chain nothing has happened: the Raider is still in base, at 4, and the legend has not triggered", async () => {
    const game = await board().build();
    await game.p1.cast("rage", { targets: ["raider"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["rage"]);
    expect(game.locationOf("raider")).toBe("base");
    expect(game.state("raider").might).toBe(4);
  });

  test("ruling: the spell resolves ENTIRELY first — it is already in the trash and the Raider is an attacker at bf1 — and only then is Ahri's trigger on the chain, unresolved", async () => {
    const game = await ragedIntoBf1();
    expect(game.zoneOf("rage")).toBe("trash");
    expect(game.state("raider")).toMatchObject({ combatRole: "attacker", zone: "battlefield-bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P1, triggered: true })]);
    expect(game.state("raider").might).toBe(4); // the -1 has NOT applied yet
  });

  test("ruling: once that queued trigger resolves the Raider is 3", async () => {
    const game = await ragedIntoBf1();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("raider").might).toBe(3);
    expect(game.state("raider").mightModifier).toBe(-1);
  });

  test("epilogue: the showdown then plays out normally — the 9-Might Guard kills the Raider and P1 keeps bf1", async () => {
    const game = await ragedIntoBf1();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
