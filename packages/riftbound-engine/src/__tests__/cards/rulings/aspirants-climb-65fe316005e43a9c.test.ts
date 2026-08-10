/**
 * Ruling 65fe316005e43a9c — Aspirant's Climb (OGN-276 → ogn-276-298) · Battlefield
 *     "Increase the points needed to win the game by 1."
 *
 * Q: Does Aspirant's Climb need to be conquered/held for its effect, and does it affect all players?
 * A: It is a passive effect, active simply by being in play (no control needed); it raises the points needed to win by 1 for
 *    ALL players (8 → 9 in 1v1). Multiple Climbs stack (two in play ⇒ 10).
 * Rules: 365.1 (battlefield passives apply while in play), 467 / 323.1 (win check against the Victory Score).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";
import { effectiveVictoryScore } from "../../../operations/points";

const ASPIRANTS_CLIMB = "ogn-276-298";

describe("Ruling 65fe316005e43a9c — Aspirant's Climb is a global passive: +1 to the win threshold for everyone, no control needed, and it stacks", () => {
  test("an UNCONTROLLED Climb in play (nobody has conquered or holds it) already raises the score from 8 to 9 — for both players", async () => {
    const game = await scenario()
      .victoryScore(8)
      .battlefield("climb", { controller: null, def: ASPIRANTS_CLIMB, inert: false })
      .battlefield("bf2", { controller: null })
      .build();
    expect(game.gameState.battlefields.climb?.controller).toBeNull();
    expect(effectiveVictoryScore(game.gameState, P1)).toBe(9);
    expect(effectiveVictoryScore(game.gameState, P2)).toBe(9);
  });

  test("it binds the opponent too: P2 (who never touched the Climb, held by P1) reaching 8 by holding another battlefield does NOT win; the game continues", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P2, 7)
      .battlefield("climb", { controller: P1, def: ASPIRANTS_CLIMB, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "climb", { might: 2, name: "Keeper" }, "keeper")
      .unit(P2, "bf2", { might: 2, name: "Holder" }, "holder")
      .build();
    await game.advanceTurn(); // P1 ends → P2 holds bf2 at the start of P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(8);
    expect(effectiveVictoryScore(game.gameState, P2)).toBe(9);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
  });

  test("control: without the Climb the same hold to 8 wins the game for P2", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P2, 7)
      .battlefield("plain", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "plain", { might: 2, name: "Keeper" }, "keeper")
      .unit(P2, "bf2", { might: 2, name: "Holder" }, "holder")
      .build();
    await game.p1.endTurn();
    await game.settle();
    expect(game.p2.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
  });

  test("two Climbs in play stack: the win threshold becomes 10 for both players", async () => {
    const game = await scenario()
      .victoryScore(8)
      .battlefield("climbA", { controller: null, def: ASPIRANTS_CLIMB, inert: false, owner: P1 })
      .battlefield("climbB", { controller: null, def: ASPIRANTS_CLIMB, inert: false, owner: P2 })
      .build();
    expect(effectiveVictoryScore(game.gameState, P1)).toBe(10);
    expect(effectiveVictoryScore(game.gameState, P2)).toBe(10);
  });
});
