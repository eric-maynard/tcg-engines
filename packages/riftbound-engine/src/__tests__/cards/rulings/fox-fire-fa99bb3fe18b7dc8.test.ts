/**
 * Ruling fa99bb3fe18b7dc8 — Fox-Fire (OGN-256 → ogn-256-298) · Calm/Mind [Hidden][Action] spell · [3]
 *   "Kill any number of units at a battlefield with total Might 4 or less."
 *   × Ravenbloom Student (OGN-103 → ogn-103-298) · Mind Unit · [2] · 2 Might — "When you play a spell, give me +1
 *     [Might] this turn."
 *
 * Q: Does flipping Fox-Fire from hidden count as playing a spell for Ravenbloom Student's +1?
 * A: Yes — playing a card from facedown IS playing it; the Student triggers and gets +1 [Might] this turn.
 * Rules: 811.1.c (a Hidden card is PLAYED from facedown, as a Reaction, ignoring its cost), 419.4.a (play-triggers fire
 *        when the played card resolves).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FOX_FIRE = "ogn-256-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";

/**
 * Turn 3, P1 active with NO resources. Student (2) in P1's base. P1 holds bf1 with Holder (5); P2's stray Imp (2) is
 * also parked at bf1 (seeded mid-board, no combat pending) as Fox-Fire fodder. Fox-Fire was hidden at bf1 earlier.
 */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P1, "bf1", { might: 5, name: "Holder" }, "holder")
    .unit(P1, "bf1", { might: 1, name: "Pawn" }, "pawn")
    .facedown(P1, "bf1", FOX_FIRE, "fox");
}

describe("Ruling fa99bb3fe18b7dc8 — Fox-Fire played from Hidden is a spell PLAYED: Ravenbloom Student gets +1", () => {
  test("premise: Student is 2 Might; Fox-Fire is facedown at bf1 and P1 (with 0 energy) may play it from hidden", async () => {
    const game = await board().build();
    expect(game.state("student").might).toBe(2);
    expect(game.state("fox")).toMatchObject({ isHidden: true, zone: "facedown-bf1" });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("reveal", "fox")).toBe(true);
  });

  test("flipping Fox-Fire (killing the 1-Might Pawn here) puts the SPELL on the chain for [0]; when it resolves the Student's play-a-spell trigger fires → 3 Might this turn", async () => {
    const game = await board().build();
    await game.p1.reveal("fox", { targets: ["pawn"] });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("pawn");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fox", controller: P1, type: "spell" })]);
    expect(game.p1.energy()).toBe(0); // cost ignored from hidden
    expect(game.state("student").might).toBe(2); // 419.4.a — not yet: the trigger waits for the spell to resolve
    await game.settle();
    expect(game.zoneOf("fox")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.state("student")).toMatchObject({ might: 3, mightModifier: 1 });
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 1 }); // it was a card played
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("choosing NO units (legal for 'any number') still plays the spell — the Student still gets +1; and it wears off at end of turn", async () => {
    const game = await board().build();
    await game.p1.reveal("fox"); // bare reveal = the empty choice (355.13)
    await game.settle();
    expect(game.zoneOf("fox")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("battlefield-bf1");
    expect(game.state("student").might).toBe(3);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("student").might).toBe(2);
  });
});
