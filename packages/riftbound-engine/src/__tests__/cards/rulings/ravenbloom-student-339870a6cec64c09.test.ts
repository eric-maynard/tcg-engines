/**
 * Ruling 339870a6cec64c09 — Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might
 *   "When you play a spell, give me +1 [Might] this turn."
 *
 * Q: Does the Student gain +1 after EVERY spell, so 12 one-cost spells would give +12?
 * A: Yes — each spell you play is its own trigger, each gives +1 Might until end of turn, and the
 *    bonuses stack. (They are "this turn" effects, so they all fall off in the Ending Phase.)
 * Rules: 383.1 (one trigger per inciting event), 610 (Might modifiers accumulate), 317.2 (Expiration Step).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const RAVENBLOOM_STUDENT = "ogn-103-298";
const BLOOD_RUSH = "sfd-003-221";

/** P1's turn: Student (2) + Runner in base, `n` copies of Blood Rush ([1] each) in hand, exactly n energy. */
function board(n: number) {
  let b = scenario()
    .resources(P1, { energy: n })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner");
  for (let i = 0; i < n; i++) {
    b = b.hand(P1, BLOOD_RUSH, `rush${i + 1}`);
  }
  return b;
}

describe("Ruling 339870a6cec64c09 — Ravenbloom Student gains +1 Might per spell played, and they stack", () => {
  test("one spell → 3, two spells → 4, three spells → 5 (each play adds exactly one trigger)", async () => {
    const game = await board(3).build();
    expect(game.state("student").might).toBe(2);

    await game.p1.cast("rush1", { targets: "runner" });
    expect(game.chain().filter((c) => c.cardId === "student" && c.triggered)).toHaveLength(0);
    await game.settle();
    expect(game.state("student").might).toBe(3);

    await game.p1.cast("rush2", { targets: "runner" });
    await game.settle();
    expect(game.state("student").might).toBe(4);

    await game.p1.cast("rush3", { targets: "runner" });
    await game.settle();
    expect(game.state("student").might).toBe(5); // 2 + 1 + 1 + 1
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("the stacked bonuses are all 'this turn' — the Student is back to 2 next turn", async () => {
    const game = await board(3).build();
    for (const c of ["rush1", "rush2", "rush3"]) {
      await game.p1.cast(c, { targets: "runner" });
      await game.settle();
    }
    expect(game.state("student").might).toBe(5);
    await game.advanceTurn();
    expect(game.state("student").might).toBe(2);
  });
});
