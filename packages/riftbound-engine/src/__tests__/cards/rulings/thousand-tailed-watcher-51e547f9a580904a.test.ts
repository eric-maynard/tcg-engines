/**
 * Ruling 51e547f9a580904a — Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · Unit · Mind · 7+[mind] · 7 "When you play me,
 *   give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *   × Ravenbloom Student (OGN-103 → ogn-103-298) · Unit · Mind · 2 · 2 Might "When you play a spell, give me +1 [Might] this turn."
 *
 * Q: Watcher drops the Student to 1 Might; the Student's controller then plays a spell in a showdown. 2 Might, or does the
 *    -X still pin it?
 * A: 2 Might. The self-buff is added to the current value (which already includes the Watcher reduction).
 * Rules: 700–701 (Might arithmetic: modifiers sum; "to a minimum of 1" fixes the applied amount at resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WATCHER = "ogn-116-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";
/** P2's cheap Reaction so "the Student's controller plays a spell during the showdown" is easy to stage. */
const TRICK = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Trick",
  timing: "reaction",
} as const;

/** P1's turn: 7+[mind] for the Watcher, a 1-Might Scout to open a showdown. P2: Student (2) holding bf1, Trick + 1 energy. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { mind: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", RAVENBLOOM_STUDENT, "student")
    .unit(P1, "base", { might: 1, name: "Scout" }, "scout")
    .hand(P1, WATCHER, "watcher")
    .hand(P2, TRICK, "trick");
}

async function watcherShrinksStudent(): Promise<Game> {
  const game = await board().build();
  expect(game.state("student").might).toBe(2);
  await game.p1.play("watcher");
  await game.settle();
  expect(game.zoneOf("watcher")).toBe("base");
  return game;
}

describe("Ruling 51e547f9a580904a — a later +1 stacks on top of Watcher's clamped -3", () => {
  test("Watcher's play trigger takes the 2-Might Student to exactly 1 (−3, floored at 1)", async () => {
    const game = await watcherShrinksStudent();
    expect(game.state("student").might).toBe(1);
    expect(game.state("student").baseMight).toBe(2);
  });

  test("in the ensuing showdown the Student's controller plays a spell: the Student's +1 lands on the current 1 → 2 Might (not re-clamped to 1, not back to 3)", async () => {
    const game = await watcherShrinksStudent();
    await game.p1.move("scout", "bf1"); // opens a combat showdown at the Student's battlefield
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, focusPlayer: P1 });
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.cast("trick");
    // Student's "when you play a spell" trigger joins the chain; let everything on it resolve.
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind !== "action") break;
      await game.seat(d.seat).passPriority();
    }
    expect(game.zoneOf("trick")).toBe("trash");
    expect(game.state("student").might).toBe(2);
    expect(game.state("student").baseMight).toBe(2);
  });

  test("and it is 'this turn' arithmetic only: next turn the Student is simply 2 again", async () => {
    const game = await watcherShrinksStudent();
    expect(game.state("student").might).toBe(1);
    await game.advanceTurn();
    expect(game.state("student").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
