/**
 * Ruling e3a4e67e8996fb31 — Nine-Tailed Fox (OGN-255 → ogn-255-298, the Ahri LEGEND)
 *   "When an enemy unit attacks a battlefield you control, give it -1 [Might] this turn, to a minimum of
 *    1 [Might]."
 *
 * Q: In a 2v2 game, does the Ahri legend trigger when my TEAMMATE's battlefield is attacked?
 * A: No. The trigger reads "a battlefield YOU control". You and your teammate are distinct players and each
 *    controls their own battlefields, so an attack on your teammate's battlefield is not an attack on one
 *    you control and Ahri's legend does not fire.
 * Rules: 359.3.f.4 ("you"/"your" = the ability's controller, never a teammate), 190 (battlefield control is
 *        per player), 383.2 (the trigger condition is checked against the actual event).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, P3, scenario } from "../../../harness";

const NINE_TAILED_FOX = "ogn-255-298";

/**
 * A four-seat (2v2-shaped) game on P2's turn. P1 has the Ahri legend and controls bfA; P3 — P1's "teammate"
 * in the ruling's framing — controls bfB. P2 has a 5-Might Raider in base to send at one of them.
 */
function board() {
  return scenario({ players: 4 })
    .turn(3)
    .active(P2)
    .victoryScore(20)
    .legend(P1, NINE_TAILED_FOX, "fox")
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P3 })
    .unit(P1, "bfA", { might: 2, name: "P1 Holder" }, "h1")
    .unit(P3, "bfB", { might: 2, name: "P3 Holder" }, "h3")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider");
}

describe("Ruling e3a4e67e8996fb31 — the Ahri legend only sees attacks on battlefields ITS controller holds", () => {
  test("premise: P1 controls bfA and P3 controls bfB; P1 owns the legend", async () => {
    const game = await board().build();
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P3);
    expect(game.p1.legend()).toBe("fox");
  });

  test("ruling: P2 attacking the TEAMMATE's bfB does not trigger P1's legend — nothing goes on the chain and the Raider keeps its 5 Might", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bfB");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([]);
    expect(game.state("raider")).toMatchObject({ might: 5, mightModifier: 0 });
    await game.settle();
    expect(game.state("raider").mightModifier).toBe(0);
  });

  test("contrast: P2 attacking P1's OWN bfA does trigger it — the legend's ability goes on the chain and the Raider drops to 4", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bfA");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fox", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("raider")).toMatchObject({ might: 4, mightModifier: -1 });
    expect(game.violations()).toEqual([]);
  });

  test("the same holds in a plain duel: an attack on a battlefield P1 does NOT control leaves the legend silent", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .victoryScore(20)
      .legend(P1, NINE_TAILED_FOX, "fox")
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfC", { controller: null })
      .unit(P1, "bfA", { might: 2, name: "Holder" }, "h1")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bfC"); // uncontrolled battlefield — not one P1 controls
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("raider")).toMatchObject({ might: 5, mightModifier: 0 });
  });
});
