/**
 * Ruling bc3403da67aeae05 — Gust (OGN-169 → ogn-169-298) · Spell · [1] · [Reaction]
 *   "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: Can I react with Gust to my opponent moving into a battlefield they already conquered?
 * A: No. Moving between locations you already control contests nothing, so no showdown and no priority
 *    window opens. It is different if the battlefield became uncontrolled first (leave, then come back):
 *    that arrival applies Contested and does open a showdown. Your own base is always yours.
 * Rules: 190.3.a.1 (Contested only when the mover's controller does not already control the battlefield),
 *        344.2 / 348 (a showdown is what creates the reaction window), 190.4.c / 323.6 (control lapses in
 *        the next Open Cleanup once you have no unit there).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";

/** P1 durably controls bf1 (a unit stands there); bf2 is neutral and empty. P2 holds Gust. */
function p1HoldsBf1() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 2, name: "Reinforcement" }, "reinforcement")
    .hand(P2, GUST, "gust")
    .resources(P2, { energy: 1 });
}

describe("Ruling bc3403da67aeae05 — no reaction window for a move between locations you already control", () => {
  test("moving a second unit into a battlefield P1 already controls contests nothing and gives P2 no priority", async () => {
    const game = await p1HoldsBf1().build();
    await game.p1.move("reinforcement", "bf1");
    expect(game.locationOf("reinforcement")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]); // P2 never gets to act
    expect(game.p2.can("cast", "gust")).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("moving into the NEUTRAL battlefield does contest it and P2 gets the window to Gust", async () => {
    const game = await p1HoldsBf1().build();
    await game.p1.move("reinforcement", "bf2");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "reinforcement" });
    await game.settle();
    expect(game.zoneOf("reinforcement")).toBe("hand");
  });

  test("leave and come back: once control has lapsed the return DOES open a showdown", async () => {
    const game = await p1HoldsBf1().build();
    await game.p1.move("holder", "base"); // going home is never a contest — the base is always yours
    expect(game.gameState.battlefields.bf1?.controller).toBeFalsy(); // lapsed in the Cleanup (190.4.c)
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.p1.move("reinforcement", "bf1"); // now uncontrolled → this arrival contests
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("a player's base is always their own — coming home opens no window even with enemy units in play", async () => {
    const game = await p1HoldsBf1().unit(P2, "base", { might: 2, name: "Enemy Body" }, "enemy").build();
    await game.p1.move("holder", "base");
    expect(game.locationOf("holder")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]);
    expect(game.chain()).toEqual([]);
  });
});
