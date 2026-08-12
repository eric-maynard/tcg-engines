/**
 * Ruling 38cc21dc6b4a3d28 — Nine-Tailed Fox (OGN-255 → ogn-255-298) · Legend (Ahri)
 *     "When an enemy unit attacks a battlefield you control, give it -1 [Might] this turn, to a minimum of 1."
 *   × Cleave (OGN-004 → ogn-004-298) · [Action] · [1] "Give a unit [Assault 3] this turn."
 *
 * Q: An enemy attacks my battlefield with [Assault]. Does Ahri's -1 apply before or after the Assault bonus?
 * A: Assault first, Ahri second. Assault is a passive that is already on the moment the unit gains the
 *    Attacker designation — before any trigger is even placed on the chain. Ahri's ability then triggers on
 *    that designation and resolves afterwards, reducing the already-buffed Might: a 3-Might unit with
 *    [Assault 3] attacks at 6 and Ahri brings it to 5.
 * Rules: 807.1.c (Assault is a passive, not a triggered ability), 383.2 (the trigger fires on the
 *        designation), 359.2 (the trigger's effect applies when it resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NINE_TAILED_FOX = "ogn-255-298";
const CLEAVE = "ogn-004-298";

/**
 * P1's turn. P2's legend is the Nine-Tailed Fox and P2 holds bf1 with a STUNNED 8-Might Guard (it deals no
 * combat damage, so nothing dies and the Might numbers stay readable). P1 has a 3-Might Raider and Cleave.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .legend(P2, NINE_TAILED_FOX, "fox")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Guard" }, "guard", { stunned: true })
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, CLEAVE, "cleave");
}

/** Pass priority around until the chain is empty. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0 && game.decision()?.kind === "action"; i++) {
    await game.acting().passPriority();
  }
}

/** Give the Raider [Assault 3], then attack bf1. Stops with the Fox trigger on the chain. */
async function assaultingAttack(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("cleave", { targets: "raider" });
  await game.settle();
  expect(game.state("raider").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
  expect(game.state("raider").might).toBe(3); // not an attacker yet — Assault is inactive
  await game.p1.move("raider", "bf1");
  return game;
}

describe("Ruling 38cc21dc6b4a3d28 — [Assault] resolves into the Might first; the Nine-Tailed Fox's -1 lands on top of it", () => {
  test("the instant the Raider becomes the Attacker it is already at 3 + 3 = 6 Might — before the Fox trigger has resolved", async () => {
    const game = await assaultingAttack();
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("raider").might).toBe(6); // Assault applied passively, no chain item needed
    expect(game.state("raider").mightModifier).toBe(0); // the Fox has not resolved yet
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fox", controller: P2, triggered: true })]);
  });

  test("ruling: the Fox's trigger then resolves and takes the already-buffed 6 down to 5", async () => {
    const game = await assaultingAttack();
    await drainChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("raider")).toMatchObject({ combatRole: "attacker", might: 5, mightModifier: -1 });
  });

  test("the -1 is a Might modifier, not a removal of Assault: dropping out of combat costs the Assault 3 but keeps the -1 (3 - 1 = 2)", async () => {
    const game = await assaultingAttack();
    await drainChain(game);
    await game.settle(); // both pass Focus → combat resolves; the stunned Guard deals nothing
    expect(game.zoneOf("raider")).toBe("base"); // 5 into an 8-Might Guard: the attack fails and it goes home
    expect(game.state("raider").combatRole).not.toBe("attacker");
    expect(game.state("raider")).toMatchObject({ might: 2, mightModifier: -1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — without Cleave the same Raider attacks at 3 and the Fox takes it to 2", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    expect(game.state("raider").might).toBe(3);
    await drainChain(game);
    expect(game.state("raider")).toMatchObject({ might: 2, mightModifier: -1 });
  });
});
