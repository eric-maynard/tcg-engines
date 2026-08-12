/**
 * Ruling baa187cc56e963a8 — Glorious Executioner (SFD-185 → sfd-185-221) · Legend (Draven)
 *   "When you win a combat, draw 1. (You win if only your units remain after combat.)"
 *
 * Q: Does Draven's legend ability work if you conquer an EMPTY battlefield?
 * A: No. Walking onto an uncontested, empty battlefield opens a showdown, not a combat — and Draven's
 *    ability triggers only on winning a COMBAT. You conquer and score, but you draw nothing.
 * Rules: 344 (a showdown becomes a Combat only when opposing units are present), 348.2.a (a non-combat
 *        showdown closes and the sole occupant establishes control), 466 (combat and its winner).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GLORIOUS_EXECUTIONER = "sfd-185-221";

/** P1's turn with the Draven legend. bf1 is empty and uncontrolled; bf2 is held by P2's 2-Might Wall. */
function board() {
  return scenario()
    .legend(P1, GLORIOUS_EXECUTIONER, "draven")
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 5, name: "Executioner's Escort" }, "escort");
}

describe("Ruling baa187cc56e963a8 — conquering an empty battlefield is a showdown, not a combat: Draven draws nothing", () => {
  test("ruling: moving alone onto the empty bf1 conquers it and scores — but P1 draws no card", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("escort", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(handBefore); // no "win a combat" draw
  });

  test("ruling: Glorious Executioner never even goes on the chain for that showdown", async () => {
    const game = await board().build();
    await game.p1.move("escort", "bf1");
    expect(game.chain().some((c) => c.cardId === "draven")).toBe(false);
    await game.settle();
    expect(game.chain()).toEqual([]);
  });

  test("contrast: an actual COMBAT that P1 wins does trigger the legend — the 5-Might Escort kills the Wall and P1 draws 1", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("escort", "bf2");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.violations()).toEqual([]);
  });

  test("ruling, stated as the difference: the same unit, the same conquer, the same point — only the combat draws", async () => {
    const empty = await board().build();
    const emptyBefore = empty.p1.hand().length;
    await empty.p1.move("escort", "bf1");
    await empty.settle();

    const fight = await board().build();
    const fightBefore = fight.p1.hand().length;
    await fight.p1.move("escort", "bf2");
    await fight.settle();

    expect(empty.p1.points()).toBe(1);
    expect(fight.p1.points()).toBe(1);
    expect(empty.p1.hand().length - emptyBefore).toBe(0);
    expect(fight.p1.hand().length - fightBefore).toBe(1);
  });
});
