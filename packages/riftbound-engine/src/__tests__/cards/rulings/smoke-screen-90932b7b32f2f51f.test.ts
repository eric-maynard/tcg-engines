/**
 * Ruling 90932b7b32f2f51f — Smoke Screen (OGN-093 → ogn-093-298) · Spell · Mind · 2+[mind] · [Reaction]
 *     "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   × Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might · "When you play a spell, give me +1 [Might] this turn."
 *
 * Q: Smoke Screen drops the Student to 1; when its controller then plays a spell, does it stay pinned at 1 or go to 2?
 * A: It gets the +1 (→ 2). The "minimum of 1" only applies as Smoke Screen's reduction is applied, not as an ongoing cap.
 * Rules: Smoke Screen text (floor applied at application), 702-ish Might arithmetic, 383 (Student trigger via the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";
const CLEAVE = "ogn-004-298"; // [1] Action "Give a unit [Assault 3] this turn" — a cheap spell for the Student's controller to play

/** P1's turn: Student (2) + Pal in base, two Cleaves and [2]. P2: Smoke Screen with exactly 2+[mind]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2, power: { mind: 1 } })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
    .hand(P1, CLEAVE, "cleave1")
    .hand(P1, CLEAVE, "cleave2")
    .hand(P2, SMOKE_SCREEN, "smoke");
}

/** P1 Cleaves Pal; P2 answers with Smoke Screen on the Student; both pass → Smoke Screen resolves (Cleave still pending). */
async function smokedStudent(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("cleave1", { targets: "pal" });
  await game.p1.passPriority();
  await game.p2.cast("smoke", { targets: "student" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave1", "smoke"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Smoke Screen resolves first (LIFO)
  return game;
}

async function passChain(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling 90932b7b32f2f51f — Smoke Screen's 'minimum of 1' is a floor at application, not a cap afterwards", () => {
  test("Smoke Screen resolves on the 2-Might Student: -4 floored → the Student is exactly 1 Might", async () => {
    const game = await smokedStudent();
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.state("student")).toMatchObject({ baseMight: 2, might: 1 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave1"]);
  });

  test("P1's spell (Cleave) then finishes resolving → the Student's 'when you play a spell' trigger goes on the chain and resolves: +1 takes it ABOVE the floor to 2", async () => {
    const game = await smokedStudent();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Cleave resolves → Student trigger
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "student", controller: P1, triggered: true })]);
    expect(game.state("student").might).toBe(1); // not yet
    await passChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("student").might).toBe(2);
  });

  test("and it keeps climbing with further spells this turn: a second Cleave → 3; everything wears off at end of turn (back to printed 2)", async () => {
    const game = await smokedStudent();
    await passChain(game);
    expect(game.state("student").might).toBe(2);
    await game.p1.cast("cleave2", { targets: "pal" });
    await game.settle();
    expect(game.state("student").might).toBe(3);
    await game.advanceTurn();
    expect(game.state("student").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
