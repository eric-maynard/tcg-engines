/**
 * Ruling 067cfc0859fb3e8c — Time Warp (OGN-122 → ogn-122-298) · [10][mind]×4 · "Take a turn after this one. Banish this."
 *
 * Q: How does Time Warp work during the extra turns after time is called (tournament end-of-round procedure)?
 * A: After time is called exactly 5 more turns are played, whoever takes them. Time Warp's additional turn is a real turn in
 *    the sequence and counts toward the 5: A starts turn 1 and Time Warps on turn 3 ⇒ the turns go A, B, A, A*, B. (Cast on
 *    the 5th of those turns it does nothing — there is no turn left to take.)
 * Rules: 734–738 (an Additional Turn is inserted into the turn queue right after the current one; afterwards the queue resumes).
 *   The "time called / 5 turns" countdown itself is a Tournament-Rules procedure with no Core-Rules/engine object; what the
 *   engine can show is that the extra turn is an ordinary counted turn in the A, B, A, A*, B sequence.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIME_WARP = "ogn-122-298";

/** Turn 1, P1 ("A") active. P1 holds Time Warp; each side has a bystander so nothing odd happens. Victory far away. */
function board() {
  return scenario()
    .turn(1)
    .active(P1)
    .victoryScore(15)
    .unit(P1, "base", { might: 1, name: "A's Bystander" }, "a1")
    .unit(P2, "base", { might: 1, name: "B's Bystander" }, "b1")
    .hand(P1, TIME_WARP, "warp");
}

/** Cast Time Warp now (refilling exactly its cost first — pools empty between turns) and let it resolve. */
async function castWarp(game: Game): Promise<void> {
  await game.p1.do("addResources", { energy: 10 - game.p1.energy(), power: { mind: 4 - game.p1.power("mind") } });
  expect(game.p1.can("cast", "warp")).toBe(true);
  await game.p1.cast("warp");
  await game.settle();
  expect(game.zoneOf("warp")).toBe("banishment");
}

describe("Ruling 067cfc0859fb3e8c — Time Warp's extra turn is a real, counted turn: A, B, A, A*, B", () => {
  test("A (turn 1) → B (turn 2) → A (turn 3, casts Time Warp) → A again (turn 4 = the additional turn, turn counter still advances) → B (turn 5): five consecutive turns, the extra one included in the count", async () => {
    const game = await board().build();
    const seq: { turn: number; player: string }[] = [{ player: game.turnPlayer(), turn: game.turnNumber() }];
    expect(seq[0]).toEqual({ player: P1, turn: 1 });

    await game.advanceTurn(); // → B, turn 2
    seq.push({ player: game.turnPlayer(), turn: game.turnNumber() });
    await game.advanceTurn(); // → A, turn 3
    seq.push({ player: game.turnPlayer(), turn: game.turnNumber() });
    expect(game.turnPlayer()).toBe(P1);
    await castWarp(game); // Time Warp on turn 3

    await game.advanceTurn(); // → A*, turn 4 (additional turn)
    seq.push({ player: game.turnPlayer(), turn: game.turnNumber() });
    expect(game.phase()).toBe("main"); // a full, ordinary turn
    await game.advanceTurn(); // → B, turn 5 (queue resumes)
    seq.push({ player: game.turnPlayer(), turn: game.turnNumber() });

    expect(seq).toEqual([
      { player: P1, turn: 1 },
      { player: P2, turn: 2 },
      { player: P1, turn: 3 },
      { player: P1, turn: 4 }, // the Time Warp turn — counted like any other
      { player: P2, turn: 5 },
    ]);
    // and after that the normal alternation continues
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(6);
    expect(game.violations()).toEqual([]);
  });

  test("Time Warp inserts exactly ONE additional turn right after the current one (not two, not later): after A's extra turn the very next turn is B's", async () => {
    const game = await board().build();
    await castWarp(game); // cast on turn 1 already
    const r1 = await game.advanceTurn();
    expect(r1.next).toBe(P1); // A*
    const r2 = await game.advanceTurn();
    expect(r2.next).toBe(P2); // then B — only one extra turn was queued
    const r3 = await game.advanceTurn();
    expect(r3.next).toBe(P1);
  });
});
