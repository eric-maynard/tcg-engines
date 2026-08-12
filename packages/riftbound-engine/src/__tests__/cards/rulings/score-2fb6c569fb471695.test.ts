/**
 * Ruling 2fb6c569fb471695 — (the once-per-battlefield-per-turn scoring limit is PER PLAYER; no specific card)
 *   Stand-in: Charm (OGN-043 → ogn-043-298) · [1][calm] "Move an enemy unit." — used to push the opponent's
 *   unit onto an empty battlefield on MY turn, so they conquer (and score) there during it.
 *
 * Q: If a player scores at a battlefield on their opponent's turn, can the active player still score at that
 *    same battlefield later in the same turn?
 * A: Yes. Each player may score a given battlefield only once per turn, but the limit is counted per player,
 *    not per battlefield — so both players can score the same battlefield in one turn. Points are never lost.
 * Rules: 469.1 / 471.1 (Conquering scores a point), 471.2 (a player scores a given battlefield at most once
 *        per turn), 466.5 / 348.2.a (control is established when a showdown ends).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const FIGHT_OR_FLIGHT = "ogn-168-298"; // [Action] [2] "Move a unit from a battlefield to its base."

/** P1's turn. bf2 is empty and uncontrolled. P2's Wanderer (3) idles in base; P1 has Charm + a Slayer (5). */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf2", { controller: null })
    .unit(P2, "base", { might: 3, name: "Wanderer" }, "wanderer")
    .unit(P1, "base", { might: 5, name: "Slayer" }, "slayer")
    .hand(P1, CHARM, "charm");
}

/** P1 Charms the enemy Wanderer onto the empty bf2; the non-combat showdown there gives P2 the battlefield. */
async function p2ScoredOnMyTurn(): Promise<Game> {
  const game = await board().build();
  // bf2 is the only place the base-bound Wanderer can be moved to, so the destination is forced (355.10.d.2).
  await game.p1.cast("charm", { targets: "wanderer" });
  await game.settle();
  expect(game.zoneOf("charm")).toBe("trash");
  expect(game.locationOf("wanderer")).toBe("bf2");
  await closeShowdown(game);
  return game;
}

/** Pass Focus until the non-combat showdown the arrival staged is over. */
async function closeShowdown(game: Game): Promise<void> {
  for (let i = 0; i < 6 && game.decision()?.context === "showdown"; i++) {
    await game.acting().passFocus();
  }
  await game.settle();
}

describe("Ruling 2fb6c569fb471695 — both players may score the SAME battlefield during one turn", () => {
  test("P2 conquers bf2 on P1's turn (their unit was moved there by Charm) and scores a point", async () => {
    const game = await p2ScoredOnMyTurn();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.scoredThisTurn[P2]).toContain("bf2");
    expect(game.gameState.scoredThisTurn[P1] ?? []).not.toContain("bf2");
  });

  test("P1 then takes bf2 back later in the SAME turn and also scores — the per-turn limit is counted per player, and P2 keeps the point it already gained", async () => {
    const game = await p2ScoredOnMyTurn();
    await game.p1.move("slayer", "bf2");
    await game.settle();
    expect(game.zoneOf("wanderer")).toBe("trash"); // 5 ≥ 3
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(1); // points are never taken away
    expect(game.gameState.scoredThisTurn[P1]).toContain("bf2");
    expect(game.gameState.scoredThisTurn[P2]).toContain("bf2");
    expect(game.violations()).toEqual([]);
  });

  test("but each player is still capped at one score per battlefield per turn: P1 vacating bf2 and re-conquering it with a second unit gains no further point", async () => {
    const game = await board()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .hand(P1, FIGHT_OR_FLIGHT, "fof")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .build();
    await game.p1.cast("charm", { targets: "wanderer" });
    await game.settle();
    await closeShowdown(game);
    expect(game.p2.points()).toBe(1);

    await game.p1.move("slayer", "bf2");
    await game.settle();
    expect(game.p1.points()).toBe(1); // P1's first (and only) score at bf2 this turn

    await game.p1.cast("fof", { targets: "slayer" }); // send my own holder home: control lapses
    await game.settle();
    expect(game.locationOf("slayer")).toBe("base");
    expect(game.gameState.battlefields.bf2?.controller).toBeNull();

    await game.p1.move("scout", "bf2"); // conquer bf2 a second time this turn
    await closeShowdown(game);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // no second point for the same player at the same battlefield
    expect(game.p2.points()).toBe(1);
  });
});
