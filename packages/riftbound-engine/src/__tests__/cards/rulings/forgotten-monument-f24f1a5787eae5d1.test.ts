/**
 * Ruling f24f1a5787eae5d1 — Forgotten Monument (SFD-209 → sfd-209-221), Battlefield
 *   "Players can't score here until their third turn."
 *   × Kai'Sa, Survivor (ogn-039-298) · 4 Might "When I conquer, draw 1."
 *
 * Q: If you conquer Forgotten Monument before your third turn, does it count as a conquer for triggers?
 * A: No — you cannot conquer it at all before then. Conquering is a way of SCORING, and the Monument
 *    forbids scoring there until a player's third turn; with no conquer, no "when you conquer" ability
 *    fires. You can still take the battlefield by force, you just do not score or trigger anything.
 * Rules: 464/465 (conquering is a Score), 471.2.c (a Score that cannot happen is not a conquer),
 *        383.1 (a trigger fires only when its event actually occurs).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FORGOTTEN_MONUMENT = "sfd-209-221";
const KAISA = "ogn-039-298";
const FILLER = "ogn-175-298";

/**
 * `turn` maps to how many turns each player has taken in a 2-player game:
 * turn 2 ⇒ P1 is on their FIRST turn, turn 6 ⇒ P1 is on their THIRD.
 */
function board(turn: number) {
  return scenario()
    .turn(turn)
    .active(P1)
    .battlefield("mon", { controller: P2, def: FORGOTTEN_MONUMENT, inert: false })
    .unit(P1, "base", KAISA, "kaisa")
    .unit(P2, "mon", { might: 1, name: "Watcher" }, "watcher")
    .deck(P1, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"]);
}

async function attack(game: Game): Promise<void> {
  await game.p1.move("kaisa", "mon");
  await game.p1.passFocus();
  await game.p2.passFocus();
  await game.settle();
}

describe("Ruling f24f1a5787eae5d1 — Forgotten Monument cannot be conquered before a player's third turn, so no conquer trigger fires", () => {
  test("on P1's first turn: the Watcher dies and P1 takes the battlefield, but nothing is scored", async () => {
    const game = await board(2).build();
    expect(game.gameState.players[P1]?.turnsTaken).toBe(1);
    await attack(game);
    expect(game.zoneOf("watcher")).toBe("trash");
    expect(game.gameState.battlefields.mon).toMatchObject({ controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.scoredThisTurn[P1]).toEqual([]); // not even marked as scored
  });

  test("and because it was not a conquer, Kai'Sa's 'when I conquer' never fires — no card drawn", async () => {
    const game = await board(2).build();
    await attack(game);
    expect(game.p1.hand()).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("on P1's second turn it is still blocked", async () => {
    const game = await board(4).build();
    expect(game.gameState.players[P1]?.turnsTaken).toBe(2);
    await attack(game);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toEqual([]);
  });

  test("on P1's THIRD turn the same attack conquers: a point is scored and Kai'Sa's conquer trigger draws 1", async () => {
    const game = await board(6).build();
    expect(game.gameState.players[P1]?.turnsTaken).toBe(3);
    await attack(game);
    expect(game.zoneOf("watcher")).toBe("trash");
    expect(game.gameState.battlefields.mon).toMatchObject({ controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["mon"]);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.violations()).toEqual([]);
  });
});
