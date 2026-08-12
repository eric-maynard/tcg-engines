/**
 * Ruling 246d018cc10b06f7 — Smoke Screen (OGN-093 → ogn-093-298) · Reaction · [2][mind]
 *     "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   × Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might · "When you play a spell, give me +1 [Might] this turn."
 *
 * Q: Two Smoke Screens fly, one of them aimed at the Student. Why does the Student end at 2 Might instead of
 *    being held down by the first Smoke Screen's -4?
 * A: Smoke Screen applies its reduction once, when it RESOLVES, clamped to a minimum of 1 at that instant; it
 *    leaves no lingering -4 that keeps tracking the unit. The Student is taken 2 → 1 (clamped) and its own +1
 *    then lifts it back to 2 — the spent -4 never drags it down again.
 * Rules: 359.3.d (an effect applies as it resolves and then ceases to exist), 740.3 (a minimum is applied when
 *        the reduction is applied), 340.1 (LIFO), 425.1.b (a spell counts as "played" once it resolves — which
 *        is when the Student's trigger fires; the ruling narrates that +1 one step earlier, same end result).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";

/** P1's turn. P1's Student holds bf1; P2's Yordle holds bf2. Both players hold a Smoke Screen with exactly [2][mind]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .resources(P2, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", RAVENBLOOM_STUDENT, "student")
    .unit(P2, "bf2", { might: 6, name: "Yordle" }, "yordle")
    .hand(P1, SMOKE_SCREEN, "mine")
    .hand(P2, SMOKE_SCREEN, "theirs");
}

/** P1 Smoke-Screens the Yordle; P2 answers with its own Smoke Screen on the Student. */
async function bothSmokes(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("mine", { targets: "yordle" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["mine"]);
  expect(game.state("student").might).toBe(2);
  await game.p1.passPriority();
  await game.p2.cast("theirs", { targets: "student" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["mine", "theirs"]);
  return game;
}

describe("Ruling 246d018cc10b06f7 — Smoke Screen's -4 is applied once at resolution (clamped to 1), it does not keep tracking", () => {
  test("P2's Smoke Screen resolves first (LIFO) and clamps the 2-Might Student to 1", async () => {
    const game = await bothSmokes();
    await game.p2.passPriority();
    await game.p1.passPriority(); // "theirs" resolves
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.state("student").might).toBe(1); // 2 - 4, floored at 1
    expect(game.chain().map((c) => c.cardId)).toEqual(["mine"]);
  });

  test("P1's own Smoke Screen then resolves onto the Yordle (6 → 2) and, being played, puts the Student's +1 on the chain", async () => {
    const game = await bothSmokes();
    await game.p2.passPriority();
    await game.p1.passPriority(); // "theirs" resolves → Student 1
    await game.p1.passPriority();
    await game.p2.passPriority(); // "mine" resolves → Yordle 2, Student's trigger queued
    expect(game.state("yordle").might).toBe(2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "student", controller: P1, triggered: true })]);
    expect(game.state("student").might).toBe(1);
  });

  test("the +1 lifts the Student from 1 back to 2 — the already-applied -4 does not re-clamp it", async () => {
    const game = await bothSmokes();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("student").might).toBe(2);
    expect(game.state("yordle").might).toBe(2);
    expect(game.zoneOf("student")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("both reductions are 'this turn': next turn the Student is 2 and the Yordle is 6 again", async () => {
    const game = await bothSmokes();
    await game.settle();
    await game.advanceTurn();
    expect(game.state("student").might).toBe(2);
    expect(game.state("yordle").might).toBe(6);
  });
});
