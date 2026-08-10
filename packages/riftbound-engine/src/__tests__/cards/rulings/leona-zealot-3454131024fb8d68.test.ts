/**
 * Ruling 3454131024fb8d68 — Leona, Zealot (OGN-079 → ogn-079-298) · Champion · Calm · 6 · 6 Might
 *     "… Stunned enemy units here have -8 [Might], to a minimum of 1 [Might]."
 *   × Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might "When you play a spell, give me +1 [Might] this turn."
 *   × Discipline (OGN-058 → ogn-058-298) · Reaction "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Q: Is Leona's -8 a snapshot or a continuously re-applied passive? If a stunned Ravenbloom Student (reduced
 *    to 1) gets +Might from Discipline, does it rise above 1?
 * A: It is a passive that continuously reapplies. The Student stays at 1: after Discipline resolves the -8
 *    (min 1) is applied again on top of the new total; only +8 or more in total would lift it above 1.
 * Rules: 361-364 (passive abilities apply continuously), 105.2 (minimum Might), 470 (layers).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LEONA_ZEALOT = "ogn-079-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";
const DISCIPLINE = "ogn-058-298";

/** P2's turn. P1's Leona holds bf1; P2's STUNNED Ravenbloom Student (2) is also at bf1. P2 has Discipline + exactly its cost (2). */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", LEONA_ZEALOT, "leona")
    .unit(P2, "bf1", RAVENBLOOM_STUDENT, "student", { stunned: true })
    .unit(P2, "base", { might: 2, name: "Stunned Elsewhere" }, "elsewhere", { stunned: true })
    .unit(P2, "bf1", { might: 2, name: "Unstunned Here" }, "awake")
    .hand(P2, DISCIPLINE, "disc");
}

describe("Ruling 3454131024fb8d68 — Leona, Zealot's -8 is a continuous passive, not a snapshot", () => {
  test("premise: the stunned 2-Might Student at Leona's battlefield reads 1 Might (2 - 8, minimum 1); only stunned enemies HERE are affected", async () => {
    const game = await board().build();
    expect(game.state("student")).toMatchObject({ baseMight: 2, isStunned: true, might: 1 });
    expect(game.state("elsewhere").might).toBe(2); // stunned but not "here"
    expect(game.state("awake").might).toBe(2); // here but not stunned
  });

  test("Discipline (+2, and the Student's own +1 for playing a spell) resolves — the Student is STILL 1 Might: the -8 reapplies to the new total", async () => {
    const game = await board().build();
    await game.p2.cast("disc", { targets: "student" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("student").mightModifier).toBe(3); // the +2 (+1) really was applied …
    expect(game.state("student").might).toBe(1); // … but 2 + 3 - 8 → minimum 1
    expect(game.state("student").isStunned).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("control: the same Discipline on the UNSTUNNED 2-Might unit here lifts it to 4 (Leona does not apply)", async () => {
    const game = await board().build();
    await game.p2.cast("disc", { targets: "awake" });
    await game.settle();
    expect(game.state("awake").might).toBe(4);
    expect(game.state("student").might).toBe(1); // its own +1 spell trigger: 2 + 1 - 8 → 1
  });

  test("only overcoming the full -8 matters: with +8 in total (2 + 8 - 8) the stunned Student reads 2", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", LEONA_ZEALOT, "leona")
      .unit(P2, "bf1", RAVENBLOOM_STUDENT, "student", { mightModifier: 8, stunned: true })
      .build();
    expect(game.state("student").might).toBe(2);
    const seven = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", LEONA_ZEALOT, "leona")
      .unit(P2, "bf1", RAVENBLOOM_STUDENT, "student", { mightModifier: 7, stunned: true })
      .build();
    expect(seven.state("student").might).toBe(1);
  });
});
