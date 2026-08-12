/**
 * Ruling 7a27ca2d0792de2a — Fight or Flight (OGN-168 → ogn-168-298) · Spell · Chaos · [2] · [Action] [Hidden]
 *     "Move a unit from a battlefield to its base."
 *
 * Q: My opponent moves a unit to an OPEN battlefield; if I push it back with Fight or Flight, was there still a
 *    showdown?
 * A: Yes. Moving a unit to a battlefield opens a showdown even with no enemy units there. Fight or Flight is an
 *    [Action], so it is legal during that showdown; it makes a chain, resolves, and the unit goes home. The
 *    showdown does not end because of that — it ends when the players pass Focus in order (with nobody left
 *    there, no one conquers).
 * Rules: 429.1 / 340 (moving in contests ⇒ showdown), 339.1 (Showdown State), 732.1.b ([Action] in showdowns),
 *        338.1 (playing a spell creates a chain), 345 / 344.2 (the showdown closes on passed Focus).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";

/** P2's turn. bf1 is open (uncontrolled, empty). P2's Runner is in base; P1 holds Fight or Flight + [2]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P2, "base", { might: 3, name: "Runner" }, "runner")
    .hand(P1, FIGHT_OR_FLIGHT, "fof");
}

/** P2 moves in (showdown opens) and passes Focus to P1. */
async function showdownThenP1(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("runner", "bf1");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2 });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 7a27ca2d0792de2a — a showdown happens even at an empty battlefield, and Fight or Flight does not undo it", () => {
  test("the move to the OPEN battlefield opens a showdown (no enemy units needed) and Focus starts with the mover", async () => {
    const game = await board().build();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false });
    await game.p2.move("runner", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.chain()).toEqual([]);
  });

  test("Fight or Flight is playable there on the OPPONENT's turn because it is an [Action] and we are in a showdown; it makes a chain, not a second showdown", async () => {
    const game = await showdownThenP1();
    expect(game.p1.can("cast", "fof")).toBe(true);
    await game.p1.cast("fof", { targets: "runner" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fof", controller: P1, targets: ["runner"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bf1?.contested).toBe(true); // the showdown is still the one from the move
  });

  test("the chain resolves — the Runner is home in base — and the showdown is still what closes the sequence: nobody conquers bf1, no points", async () => {
    const game = await showdownThenP1();
    await game.p1.cast("fof", { targets: "runner" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("runner")).toBe("base");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control — P1 does nothing: the same showdown closes with the Runner alone at bf1, so P2 conquers and scores", async () => {
    const game = await showdownThenP1();
    await game.settle();
    expect(game.locationOf("runner")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });
});
