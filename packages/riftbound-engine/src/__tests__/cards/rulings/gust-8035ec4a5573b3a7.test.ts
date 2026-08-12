/**
 * Ruling 8035ec4a5573b3a7 — Gust (OGN-169 → ogn-169-298) · Spell · Chaos · [1] · [Reaction]
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: When I move a unit to conquer an open battlefield, can my opponent Gust it to deny me the point?
 * A: Yes. Moving in opens a NON-COMBAT showdown; once you pass Focus your opponent gets to act, and Gust bounces
 *    the unit before the conquest is settled. The showdown then closes with nobody there, so no conquer, no point.
 * Rules: 429.1 / 340 (a move that contests opens a showdown), 344.2 / 345 (the showdown closes when Focus passes
 *        in order), 348.2 (control/conquest settled by who remains), 466.5.b (nobody left ⇒ uncontrolled).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";

/** P1's turn. bf1 is open (uncontrolled, empty). P1's 2-Might Scout is in base; P2 holds Gust + [1]. */
function board() {
  return scenario()
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P2, GUST, "gust");
}

describe("Ruling 8035ec4a5573b3a7 — Gust in the non-combat showdown denies the conquer point", () => {
  test("moving in opens a non-combat showdown at the open battlefield: contested by P1, nobody controls it yet, no point scored", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("P1 passes Focus and P2 now gets a window: Gust is legal on the 2-Might Scout", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "gust")).toBe(true);
    const targets = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options;
    expect(targets).toEqual([["scout"]]);
  });

  test("Gust resolves: the Scout goes to P1's hand, the showdown closes with nobody there — bf1 stays uncontrolled and P1 scores nothing", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("gust", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control — P2 does nothing: the showdown closes with the Scout alone there, P1 conquers bf1 and scores 1", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.locationOf("scout")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
