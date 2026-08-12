/**
 * Ruling 35fbaf4b5f3a44fe — (which moves give the opponent a window; no specific card)
 *   Vanilla stand-ins only.
 *
 * Q: Does moving a unit to a battlefield I already control let my opponent react? Do they get priority?
 * A: No. A Standard Move is not a chain item, so moving onto a battlefield you control (or back to base)
 *    hands nobody priority. Moving to a battlefield the opponent controls stages a showdown, and moving to an
 *    open one stages a non-combat showdown — those are where the opponent may act.
 * Rules: 140 (Standard Move: a turn action, never a chain item), 344.2 (arriving at a battlefield you do not
 *        control applies Contested and stages a Showdown), 347 (the showdown is where Focus is handed out).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** P1's turn. bfMine is P1's (garrisoned), bfOpen is empty and uncontrolled, bfTheirs is P2's (defended). */
function board() {
  return scenario()
    .battlefield("bfMine", { controller: P1 })
    .battlefield("bfOpen", { controller: null })
    .battlefield("bfTheirs", { controller: P2 })
    .unit(P1, "bfMine", { might: 2, name: "Garrison" }, "garrison")
    .unit(P2, "bfTheirs", { might: 6, name: "Keeper" }, "keeper")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner");
}

describe("Ruling 35fbaf4b5f3a44fe — only a move that contests a battlefield opens a window for the opponent", () => {
  test("moving onto a battlefield I already control: no chain, no showdown, and play stays with me in my open main phase", async () => {
    const game = await board().build();
    await game.p1.move("runner", "bfMine");
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bfMine).toMatchObject({ contested: false, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.decision()).toBeNull();
    expect(game.locationOf("runner")).toBe("bfMine");
    expect(game.violations()).toEqual([]);
  });

  test("moving from a battlefield back to base likewise gives the opponent nothing to react to", async () => {
    const game = await board().build();
    await game.p1.move("garrison", "base");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.locationOf("garrison")).toBe("base");
  });

  test("moving to an OPEN battlefield I don't control stages a non-combat showdown — the opponent is in it", async () => {
    const game = await board().build();
    await game.p1.move("runner", "bfOpen");
    expect(game.decision()).toMatchObject({ context: "showdown" });
    expect(game.gameState.battlefields.bfOpen?.contested).toBe(true);
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
  });

  test("moving into the battlefield the OPPONENT controls stages the showdown where they may react — and my unit is already there when they do", async () => {
    const game = await board().build();
    await game.p1.move("runner", "bfTheirs");
    expect(game.locationOf("runner")).toBe("bfTheirs"); // the move is done before anyone can respond
    expect(game.gameState.battlefields.bfTheirs?.contested).toBe(true);
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
  });
});
