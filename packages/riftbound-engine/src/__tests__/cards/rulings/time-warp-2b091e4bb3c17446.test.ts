/**
 * Ruling 2b091e4bb3c17446 — Time Warp (OGN-122 → ogn-122-298) · [10][mind]×4
 *     "Take a turn after this one. Banish this."
 *
 * Q: How does Time Warp behave in overtime (the fixed run of turns played after time is called), and is it
 *    worth playing on the last of those turns?
 * A: The extra turn is a real turn inserted directly after the current one, so it counts as one of overtime's
 *    turns and is "stolen" from the opponent: cast on OT turns 0–4 you take the next turn yourself; cast on
 *    the final OT turn there is no turn left to take, so it does nothing.
 *    (The overtime countdown itself is a Tournament-Rules procedure with no engine object; what the engine
 *    shows is the turn-queue arithmetic that makes the ruling true — the additional turn occupies the very
 *    next slot in the sequence rather than being appended after the opponent's.)
 * Rules: 734–738 (an Additional Turn is inserted immediately after the current turn; the queue then resumes).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIME_WARP = "ogn-122-298";

/** Turn 1, P1 ("A") active, victory far away; each side has a bystander so nothing else happens. */
function board() {
  return scenario()
    .turn(1)
    .active(P1)
    .victoryScore(15)
    .unit(P1, "base", { might: 1, name: "A's Bystander" }, "a1")
    .unit(P2, "base", { might: 1, name: "B's Bystander" }, "b1")
    .hand(P1, TIME_WARP, "warp");
}

/** Refill exactly Time Warp's cost (pools empty between turns), cast it and let it resolve. */
async function castWarp(game: Game): Promise<void> {
  await game.p1.do("addResources", { energy: 10 - game.p1.energy(), power: { mind: 4 - game.p1.power("mind") } });
  expect(game.p1.can("cast", "warp")).toBe(true);
  await game.p1.cast("warp");
  await game.settle();
  expect(game.zoneOf("warp")).toBe("banishment");
}

describe("Ruling 2b091e4bb3c17446 — Time Warp steals the very next turn, so in a five-turn overtime it consumes one of the opponent's", () => {
  test("A casts it on the 3rd turn of a five-turn window: the window runs A, B, A, A*, B — B loses one of their two turns", async () => {
    const game = await board().build();
    const seq: { player: string; turn: number }[] = [{ player: game.turnPlayer(), turn: game.turnNumber() }];
    await game.advanceTurn(); // B
    seq.push({ player: game.turnPlayer(), turn: game.turnNumber() });
    await game.advanceTurn(); // A
    seq.push({ player: game.turnPlayer(), turn: game.turnNumber() });
    await castWarp(game);
    await game.advanceTurn(); // A* — the additional turn, taken instead of B's
    seq.push({ player: game.turnPlayer(), turn: game.turnNumber() });
    await game.advanceTurn(); // B
    seq.push({ player: game.turnPlayer(), turn: game.turnNumber() });
    expect(seq).toEqual([
      { player: P1, turn: 1 },
      { player: P2, turn: 2 },
      { player: P1, turn: 3 },
      { player: P1, turn: 4 },
      { player: P2, turn: 5 },
    ]);
    expect(seq.filter((s) => s.player === P1)).toHaveLength(3); // the 3:2 split the ruling describes
    expect(seq.filter((s) => s.player === P2)).toHaveLength(2);
  });

  test("cast on the 4th turn of the window instead, A also takes the 5th and last turn — and only one extra turn is ever queued", async () => {
    const game = await board().build();
    await game.advanceTurn(); // B (2)
    await game.advanceTurn(); // A (3)
    await game.advanceTurn(); // B (4)
    await game.advanceTurn(); // A (5)
    expect(game.turnPlayer()).toBe(P1);
    await castWarp(game);
    const r1 = await game.advanceTurn();
    expect(r1).toEqual({ next: P1, turn: 6 }); // the stolen turn — the last one in a five-turn window
    const r2 = await game.advanceTurn();
    expect(r2.next).toBe(P2); // the queue simply resumes; no second extra turn
    expect(game.violations()).toEqual([]);
  });

  test("the additional turn is an ordinary turn (its own Beginning Phase, main phase and turn number), which is why it counts toward the five", async () => {
    const game = await board().build();
    await castWarp(game);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(2);
    expect(game.phase()).toBe("main");
  });
});
