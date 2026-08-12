/**
 * Ruling 756b1131568f9d47 — Time Warp (OGN-122 → ogn-122-298) · Spell · Mind · [10][mind][mind][mind][mind]
 *   "Take a turn after this one. Banish this."
 *   × Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might · "When you play a spell, give me +1 [Might] this turn."
 *     (the "when you play a spell" watcher the answer's last nuance is about)
 *
 * Q: How would Time Warp work with the Repeat keyword?
 * A: Repeat is an ADDITIONAL COST that makes the spell's instructions execute one extra time on resolution — two
 *    extra turns queued back to back. Crucially (746.3.a) the spell is still only PLAYED ONCE, so "when you play a
 *    spell" watchers see exactly one play. Time Warp as printed has no Repeat, so it grants exactly one extra turn.
 * Rules: 746.1.d.1 (paid Repeat ⇒ effect performed an additional time), 746.3.a (still one play),
 *        734 ("take a turn after this one"), 357 (additional costs are paid as the spell is played).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TIME_WARP = "ogn-122-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";

/** P1's turn with exactly Time Warp's [10] + four [mind], and a spell-watcher on the board. */
function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { energy: 10, power: { mind: 4 } })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .hand(P1, TIME_WARP, "tw");
}

describe("Ruling 756b1131568f9d47 — Time Warp has no Repeat; one execution, one extra turn, one 'play'", () => {
  test("Time Warp as printed offers no Repeat election, and naming one is refused", async () => {
    const game = await board().build();
    const fields = game.p1.option("cast", "tw")?.fields ?? [];
    expect(fields.find((f) => f.arg === "repeat")).toBeUndefined();
    const attempt = await game.p1.try((p) => p.cast("tw", { repeat: 1 }));
    expect(attempt.ok).toBe(false);
  });

  test("it resolves once: the spell is banished (not trashed) and P1 takes the turn after this one", async () => {
    const game = await board().build();
    await game.p1.cast("tw");
    await game.settle();
    expect(game.zoneOf("tw")).toBe("banishment");
    expect(game.p1.energy()).toBe(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1); // the inserted extra turn, not P2's
  });

  test("…and only ONE extra turn was queued — the turn after the extra one goes back to P2 (746.1.d.1 needs Repeat)", async () => {
    const game = await board().build();
    await game.p1.cast("tw");
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
  });

  test("746.3.a — the spell counts as PLAYED exactly once: the Student gets +1, never +2", async () => {
    const game = await board().build();
    expect(game.state("student").might).toBe(2);
    await game.p1.cast("tw");
    await game.settle();
    expect(game.state("student")).toMatchObject({ might: 3, mightModifier: 1 });
    expect(game.violations()).toEqual([]);
  });
});
