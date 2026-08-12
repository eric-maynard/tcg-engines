/**
 * Ruling 6dd62025d982ea4f — Nine-Tailed Fox (OGN-255 → ogn-255-298) · Ahri's Legend
 *   "When an enemy unit attacks a battlefield you control, give it -1 [Might] this turn, to a minimum of 1 [Might]."
 *   × Brush (UNL-T03 → unl-t03) · Battlefield · "Bird, Cat, Dog, Poro, and Ivern units here have +1 [Might]."
 *
 * Q: A unit moves to a battlefield that grants +1 [Might]. Does Ahri's Legend trigger fire before or after
 *    the battlefield's bonus is applied?
 * A: The battlefield bonus first — it is a PASSIVE (static) ability that applies the instant the unit is there and
 *    never uses the chain. Ahri's Legend is a TRIGGER: it goes on the chain and only lowers the Might afterwards.
 * Rules: 187.7/476.1 (static auras apply continuously, no chain), 383 (triggered abilities use the chain),
 *        336/337 (initial chain on attack).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NINE_TAILED_FOX = "ogn-255-298";
const BRUSH = "unl-t03";

/** P2's turn. P1 holds Brush (live text) with a fat Guard; P2 has a 3-Might Poro in base and Ahri is P1's Legend. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .legend(P1, NINE_TAILED_FOX, "ahri")
    .battlefield("brush", { controller: P1, def: BRUSH, inert: false })
    .unit(P1, "brush", { might: 9, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 3, name: "Poro Raider", tags: ["Poro"] }, "poro");
}

/** Both seats pass priority once (resolves the top chain item). */
async function bothPass(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

describe("Ruling 6dd62025d982ea4f — Brush's static +1 lands on arrival; Ahri's -1 only when her trigger resolves", () => {
  test("in base the Poro is a plain 3 — Brush's aura is location-scoped and Ahri has nothing to trigger on", async () => {
    const game = await board().build();
    expect(game.state("poro").might).toBe(3);
    expect(game.chain()).toEqual([]);
  });

  test("the moment it attacks Brush the +1 is ALREADY applied (4) while Ahri's trigger is still an unresolved chain item", async () => {
    const game = await board().build();
    await game.p2.move("poro", "brush");
    // Static first, and it never went on the chain.
    expect(game.state("poro").might).toBe(4);
    expect(game.state("poro").staticMightBonus).toBe(1);
    expect(game.state("poro").mightModifier).toBe(0);
    expect(game.state("poro").combatRole).toBe("attacker");
    // The Legend's ability is a TRIGGER — it is on the chain, unresolved.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P1, triggered: true })]);
  });

  test("only after Ahri's trigger resolves does the -1 apply: 3 + 1 (Brush, still on) - 1 (Ahri) = 3", async () => {
    const game = await board().build();
    await game.p2.move("poro", "brush");
    await bothPass(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("poro")).toMatchObject({ might: 3, mightModifier: -1, staticMightBonus: 1 });
    expect(game.violations()).toEqual([]);
  });

  test("the Brush bonus is continuous, the Ahri penalty is 'this turn': after the turn ends the Poro is 3 + 1 again", async () => {
    const game = await board().build();
    await game.p2.move("poro", "brush");
    await bothPass(game);
    expect(game.state("poro").might).toBe(3);
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    if (game.zoneOf("poro") === "battlefield-brush") {
      expect(game.state("poro")).toMatchObject({ might: 4, mightModifier: 0, staticMightBonus: 1 });
    } else {
      // Combat sent it home; the aura no longer applies and neither does the penalty.
      expect(game.state("poro")).toMatchObject({ might: 3, mightModifier: 0, staticMightBonus: 0 });
    }
  });
});
