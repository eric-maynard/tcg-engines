/**
 * Ruling 3365a36806ed2408 — (no copy limit on the board; no specific card)
 *   Stand-in: Teemo, Scout (OGN-197 → ogn-197-298) · Champion unit · [2] · 1 [Might] ·
 *   "[Hidden] … When you play me, give me +3 [Might] this turn." — used as P1's CHOSEN champion plus two
 *   further copies from hand.
 *
 * Q: Can you have several copies of the same unit in play at once, including your chosen champion?
 * A: Yes — nothing limits how many copies of a unit (champion or not) are on the board at the same time,
 *    and each copy triggers its own abilities.
 * Rules: 101.4.b (the 3-copy limit is a DECK-construction rule, not a board rule), 174.2 (the chosen
 *        champion is just a card in the Champion Zone), 383.2 (each object's trigger fires for itself).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const TEEMO_SCOUT = "ogn-197-298";

/** P1's turn with [6]: Teemo as the chosen champion and two more copies in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 6 })
    .champion(P1, TEEMO_SCOUT, "champTeemo")
    .hand(P1, TEEMO_SCOUT, "teemo2")
    .hand(P1, TEEMO_SCOUT, "teemo3");
}

/** Play the chosen champion, then both hand copies, all into base. */
async function threeTeemos(): Promise<Game> {
  const game = await board().build();
  await game.p1.playChampion("base");
  await game.settle();
  await game.p1.play("teemo2");
  await game.settle();
  await game.p1.play("teemo3");
  await game.settle();
  return game;
}

describe("Ruling 3365a36806ed2408 — any number of copies of the same unit, chosen champion included, may share the board", () => {
  test("all three copies of Teemo, Scout — the one from the Champion Zone and two from hand — are on the board at the same time", async () => {
    const game = await threeTeemos();
    expect(game.p1.units("base").sort()).toEqual(["champTeemo", "teemo2", "teemo3"]);
    for (const id of ["champTeemo", "teemo2", "teemo3"]) {
      expect(game.state(id).defId).toBe(TEEMO_SCOUT);
      expect(game.zoneOf(id)).toBe("base");
    }
    expect(game.p1.champion()).toBeUndefined(); // the Champion Zone copy really left it
    expect(game.violations()).toEqual([]);
  });

  test("each copy triggers its own 'When you play me' — every Teemo is individually 1 + 3 = 4 Might this turn", async () => {
    const game = await threeTeemos();
    for (const id of ["champTeemo", "teemo2", "teemo3"]) {
      expect(game.state(id)).toMatchObject({ baseMight: 1, might: 4 });
    }
    expect(game.p1.energy()).toBe(0); // 3 × [2]
  });

  test("the copies are independent objects: killing one in combat leaves the other two untouched", async () => {
    const game = await threeTeemos();
    await game.advanceTurn();
    await game.advanceToTurnOf(P1); // the +3 "this turn" is long gone: each Teemo is a 1-Might unit
    expect(game.state("teemo2").might).toBe(1);
    expect(game.p1.units("base").sort()).toEqual(["champTeemo", "teemo2", "teemo3"]);
  });
});
