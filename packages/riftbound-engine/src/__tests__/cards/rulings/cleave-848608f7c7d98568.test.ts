/**
 * Ruling 848608f7c7d98568 — Cleave (OGN-004 → ogn-004-298) · Action [1] "Give a unit [Assault 3] this turn. (+3 [Might] while
 *     it's an attacker.)"
 *   × Smoke Screen (OGN-093 → ogn-093-298) · Reaction [2][mind] "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   × (Ravenbloom) Student (ogn-103-298) · 2 Might · "When you play a spell, give me +1 [Might] this turn."
 *
 * Q: A small Student gets Cleave; the opponent answers with Smoke Screen. Does the Student go to "−4 under the hood" (so later
 *    bonuses are eaten) or does it stay at minimum 1, and how does Cleave's +3 then apply?
 * A: Smoke Screen only reduces to the minimum of 1 — the modifier actually applied is SNAPSHOTTED (here −1, not −4). Later
 *    bonuses stack on that: current + 3 (Assault, while attacking) − 1 (snapshotted) [+1 if the Student's own spell trigger
 *    resolves] — the −4 is never re-applied.
 * Rules: 702.2 / 430 (Might modification "to a minimum of" clamps at application), 807 (Assault only while attacker), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";
const SMOKE_SCREEN = "ogn-093-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";

/**
 * P1's turn with [1] and Cleave; Ravenbloom Student (2) ready in P1's base. P2 holds bf1 with a 9-Might Wall (an
 * opponent-controlled battlefield to attack so Assault switches on) and has Smoke Screen with exactly [2][mind].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, SMOKE_SCREEN, "smoke");
}

/** P1 Cleaves the Student; P2 responds with Smoke Screen on it; Smoke Screen (top) resolves. Cleave still pending. */
async function smokeResolved(): Promise<Game> {
  const game = await board().build();
  expect(game.state("student")).toMatchObject({ baseMight: 2, might: 2 });
  await game.p1.cast("cleave", { targets: "student" });
  await game.p1.passPriority();
  await game.p2.cast("smoke", { targets: "student" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "smoke"]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("smoke")).toBe("trash");
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
  return game;
}

describe("Ruling 848608f7c7d98568 — Smoke Screen's −4 is snapshotted at the clamp; Cleave/Student bonuses stack on top", () => {
  test("Smoke Screen on the 2-Might Student: it becomes 1 (minimum), and the modifier recorded is the −1 actually applied — not −4", async () => {
    const game = await smokeResolved();
    expect(game.state("student")).toMatchObject({ baseMight: 2, might: 1, mightModifier: -1 });
  });

  test("Cleave then resolves (Assault 3 granted — no Might change off-combat, still 1); the Student's own 'you played a spell' trigger follows and its +1 lands on top of the snapshot: 2 − 1 + 1 = 2 (not clamped back to 1)", async () => {
    const game = await smokeResolved();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Cleave
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("student").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("student").might).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "student", triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Student +1
    expect(game.chain()).toEqual([]);
    expect(game.state("student")).toMatchObject({ might: 2, mightModifier: 0 });
  });

  test("attacking P2's battlefield turns Assault on: 2 (printed) − 1 (snapshotted Smoke Screen) + 1 (Student trigger) + 3 (Assault) = 5 — the −4 is never re-applied", async () => {
    const game = await smokeResolved();
    await game.settle(); // Cleave, then the Student trigger
    expect(game.state("student").might).toBe(2);
    await game.p1.move("student", "bf1");
    expect(game.state("student")).toMatchObject({ combatRole: "attacker", might: 5 });
    expect(game.violations()).toEqual([]);
  });

  test("the ruling's other line — without the Student's +1 (read right after Cleave, before its trigger resolves) an attacker would be 2 + 3 − 1 = 4; and everything wears off next turn (Student back to 2)", async () => {
    const game = await smokeResolved();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Cleave only
    const s = game.state("student");
    expect(s.baseMight + s.mightModifier + 3).toBe(4); // what Assault would make it at this point
    await game.settle();
    await game.advanceTurn();
    expect(game.state("student")).toMatchObject({ grantedKeywords: [], might: 2, mightModifier: 0 });
  });
});
