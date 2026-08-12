/**
 * Ruling 726548faf839d374 — Thrill of the Hunt (UNL-184 → unl-184-219) · Spell · Fury/Body · [2][rainbow] · [Reaction]
 *   "Banish a friendly unit, then its owner plays it to any battlefield, ignoring its cost."
 *
 * Q: I Hold BF A in my Beginning Phase, then move that unit to BF B; the enemy uses Thrill of the Hunt to drop a
 *    unit onto the now-empty BF A. If I move back into BF A, does a showdown start, and can I score there again?
 * A: Yes to the showdown — BF A is theirs, so arriving applies Contested. No to the point: a player may only Score
 *    once per battlefield per turn, and the Hold already used BF A up. Winning gives control back, nothing else.
 * Rules: 344 (Contested ⇒ showdown), 465/468 (Score = Hold or Conquer, once per battlefield per turn),
 *        356.1.b ("ignoring its cost"), 446.1 (moves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THRILL_OF_THE_HUNT = "unl-184-219";

/** P2's turn, about to pass to P1. P1 holds BF A with Irelia (Ganking) and keeps a Reserve at home. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: null })
    .unit(P1, "bfA", { keywords: ["Ganking"], might: 5, name: "Irelia" }, "irelia")
    .unit(P1, "base", { might: 5, name: "Reserve" }, "reserve")
    .unit(P2, "base", { might: 3, name: "Hunter" }, "hunter")
    .resources(P2, { energy: 2, power: { rainbow: 1 } })
    .hand(P2, THRILL_OF_THE_HUNT, "thrill");
}

/** P1's turn starts: the Hold at BF A scores P1's one and only BF A point of this turn. */
async function holdBfA(): Promise<Game> {
  const game = await board().build();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.p1.points()).toBe(1); // Hold at BF A
  return game;
}

/** Pass Focus for whoever holds it until no showdown is waiting on a pass (two can be staged at once). */
async function closeShowdowns(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "showdown") {
      return;
    }
    await game.seat(d.seat).passFocus();
  }
}

/** Irelia leaves for BF B; in that showdown P2 reacts with Thrill and re-plays the Hunter onto BF A. */
async function leaveAndLoseBfA(): Promise<Game> {
  const game = await holdBfA();
  await game.p2.do("addResources", { energy: 2, playerId: P2, power: { rainbow: 1 } });
  await game.p1.gank("irelia", "bfB");
  await game.p1.passFocus(); // the arriving player holds Focus; P2 answers with the Reaction
  await game.p2.cast("thrill", { answers: ["bfA"], targets: "hunter" });
  await closeShowdowns(game);
  return game;
}

describe("Ruling 726548faf839d374 — re-entering a battlefield you already scored this turn: showdown yes, second point no", () => {
  test("1. the Hold at BF A scores P1's BF A point for the turn before anything moves", async () => {
    const game = await holdBfA();
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("2–3. Irelia ganks to BF B and P2's Thrill re-plays the Hunter onto the vacated BF A, taking it", async () => {
    const game = await leaveAndLoseBfA();
    expect(game.locationOf("irelia")).toBe("bfB");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.locationOf("hunter")).toBe("bfA");
    expect(game.gameState.battlefields.bfA?.controller).toBe(P2);
    expect(game.zoneOf("thrill")).toBe("trash");
  });

  test("4. moving back into BF A DOES open a showdown — P2 controls it now, so the arriving unit applies Contested", async () => {
    const game = await leaveAndLoseBfA();
    await game.p1.move("reserve", "bfA");
    expect(game.decision()).toMatchObject({ context: "showdown" });
    expect(game.state("reserve").combatRole).toBe("attacker");
    expect(game.state("hunter").combatRole).toBe("defender");
  });

  test("5. …and winning it returns control with NO extra point: BF A was already scored this turn (465)", async () => {
    const game = await leaveAndLoseBfA();
    const before = game.p1.points();
    await game.p1.move("reserve", "bfA");
    await closeShowdowns(game);
    expect(game.zoneOf("hunter")).toBe("trash"); // 5 beats 3
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p1.points()).toBe(before);
    expect(game.violations()).toEqual([]);
  });
});
