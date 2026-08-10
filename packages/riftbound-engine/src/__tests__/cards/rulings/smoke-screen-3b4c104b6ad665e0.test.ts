/**
 * Ruling 3b4c104b6ad665e0 — Smoke Screen (OGN-093 → ogn-093-298) · Reaction · Mind · 2 + [mind]
 *     "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   × Kayn, Unleashed (OGN-189 → ogn-189-298) · 6 Might   × Discipline (OGN-058 → ogn-058-298) "+2 [Might] this turn. Draw 1."
 *   (damage source used here: Falling Comet ogn-085-298 "Deal 6 to a unit at a battlefield.")
 *
 * Q: A unit has damage marked on it outside of combat; Smoke Screen then reduces its Might below that damage —
 *    does it die?
 * A: Yes. Marked damage stays until cleared (combat cleanup / end of turn). Sequence: 6 damage is dealt to Kayn
 *    (buffed to 8 by Discipline, so he survives); Smoke Screen makes him 4; 6 marked ≥ 4 → he dies.
 * Rules: 142.4 (lethal damage = damage ≥ Might, checked continuously), 323 (cleanup kills), 517.2 (damage clears
 *        at end of turn), Smoke Screen's minimum of 1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const KAYN = "ogn-189-298";
const DISCIPLINE = "ogn-058-298";
const FALLING_COMET = "ogn-085-298";

/**
 * P2's (the opponent's) turn. P1's Kayn (6) holds bf1; P1 floats exactly 2 for Discipline. P2 has Falling Comet (5)
 * and Smoke Screen (2 + [mind]) with exactly 7 energy + 1 mind.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 7, power: { mind: 1 } })
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", KAYN, "kayn")
    .hand(P2, FALLING_COMET, "comet")
    .hand(P2, SMOKE_SCREEN, "smoke")
    .hand(P1, DISCIPLINE, "disc");
}

/** P2 Comets Kayn; P1 responds with Discipline; both resolve (Discipline first): Kayn is 8 Might carrying 6 damage. */
async function damagedKayn(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("comet", { targets: "kayn" });
  await game.p2.passPriority();
  await game.p1.cast("disc", { targets: "kayn" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["comet", "disc"]);
  await game.settle();
  expect(game.zoneOf("kayn")).toBe("battlefield-bf1");
  expect(game.state("kayn")).toMatchObject({ damage: 6, might: 8 }); // survived: 6 < 8, and the damage stays MARKED
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 3b4c104b6ad665e0 — reducing Might below already-marked damage (outside combat) kills the unit", () => {
  test("steps 1-2: 6 damage on a Discipline-buffed Kayn (8) does not kill him and remains marked after the chain empties", async () => {
    await damagedKayn();
  });

  test("step 3-5: Smoke Screen (-4 → 4 Might) resolves; 6 marked damage ≥ 4 Might → Kayn dies", async () => {
    const game = await damagedKayn();
    await game.p2.cast("smoke", { targets: "kayn" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.zoneOf("kayn")).toBe("trash");
    expect(game.p1.units()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: Smoke Screen bottoms out at 1 Might — on an UNDAMAGED 2-Might unit it gives 1, and the unit lives", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { mind: 1 } })
      .unit(P1, "base", { might: 2, name: "Small" }, "small")
      .hand(P2, SMOKE_SCREEN, "smoke")
      .build();
    await game.p2.cast("smoke", { targets: "small" });
    await game.settle();
    expect(game.state("small")).toMatchObject({ damage: 0, might: 1, zone: "base" });
  });

  test("nuance: marked damage clears at end of turn — if P2 just ends the turn instead, Kayn starts P1's turn undamaged (and un-buffed, 6)", async () => {
    const game = await damagedKayn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("kayn")).toMatchObject({ damage: 0, might: 6, zone: "battlefield-bf1" });
  });
});
