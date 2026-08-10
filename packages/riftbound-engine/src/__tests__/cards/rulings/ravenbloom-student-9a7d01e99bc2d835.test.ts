/**
 * Ruling 9a7d01e99bc2d835 — Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might · Mind
 *   "When you play a spell, give me +1 [Might] this turn."
 *   × Hextech Ray (OGN-009 → ogn-009-298) · Action [1][fury] · "Deal 3 to a unit at a battlefield."
 *   × Consult the Past (OGN-083 → ogn-083-298) · Reaction [4] · "Draw 2."
 *
 * Q: Student is at 3 Might; the opponent Hextech Rays it (3 damage). Can its controller respond with a spell so the
 *    Student's trigger gives it +1 before the Ray resolves and it survives?
 * A: Yes. Ray on the chain → controller responds with Consult the Past → Consult resolves → the Student's "play a
 *    spell" trigger goes on the chain → resolves (+1 → 4 Might) → Ray resolves dealing 3 to a 4-Might Student: it lives.
 * Rules: 419.4.a (play triggers fire on resolution), 331/332 (chain LIFO; new triggers are added on top before the
 *        next item resolves), 140.3 (a unit dies only when damage ≥ Might).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RAVENBLOOM_STUDENT = "ogn-103-298";
const HEXTECH_RAY = "ogn-009-298";
const CONSULT_THE_PAST = "ogn-083-298";

/**
 * P2's turn. P1's Student stands at P1's bf1, buffed (2 + 1 = 3 Might). P2 holds Hextech Ray with [1][fury];
 * P1 holds Consult the Past with [4]. Known P1 deck top for the draw.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", RAVENBLOOM_STUDENT, "student", { buffed: true })
    .hand(P1, CONSULT_THE_PAST, "consult")
    .hand(P2, HEXTECH_RAY, "ray")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** P2 Rays the Student; P1 answers with Consult the Past. Chain = [ray, consult]. */
async function rayThenConsult(): Promise<Game> {
  const game = await board().build();
  expect(game.state("student").might).toBe(3);
  await game.p2.cast("ray", { targets: "student" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "consult")).toBe(true);
  await game.p1.cast("consult");
  expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "consult"]);
  return game;
}

describe("Ruling 9a7d01e99bc2d835 — a Reaction spell in response makes the Student 4 Might before Hextech Ray resolves", () => {
  test("Consult the Past resolves first (LIFO): P1 draws 2, and only THEN the Student's play-a-spell trigger goes on the chain above the still-waiting Ray", async () => {
    const game = await rayThenConsult();
    // Casting alone did not trigger the Student (419.4.a).
    expect(game.chain().some((c) => c.cardId === "student")).toBe(false);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Consult resolves
    expect(game.zoneOf("consult")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "student"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "student", controller: P1, triggered: true });
    expect(game.state("student").might).toBe(3); // trigger not resolved yet
    expect(game.state("student").damage).toBe(0); // Ray not resolved yet
  });

  test("the Student's trigger resolves next: +1 this turn → 4 Might, with Hextech Ray still on the chain", async () => {
    const game = await rayThenConsult();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Consult resolves → trigger
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "student"); i++) {
      await game.acting().passPriority();
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
    expect(game.state("student")).toMatchObject({ damage: 0, might: 4, mightModifier: 1 });
  });

  test("ruling: Hextech Ray finally resolves for 3 into the now-4-Might Student — it survives at bf1 with 3 damage", async () => {
    const game = await rayThenConsult();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("student")).toBe("battlefield-bf1");
    expect(game.state("student")).toMatchObject({ damage: 3, might: 4 });
    expect(game.p1.trash()).not.toContain("student");
    expect(game.violations()).toEqual([]);
  });

  test("control — with no response the 3-Might Student simply dies to the Ray", async () => {
    const game = await board().build();
    await game.p2.cast("ray", { targets: "student" });
    await game.settle();
    expect(game.zoneOf("student")).toBe("trash");
  });
});
