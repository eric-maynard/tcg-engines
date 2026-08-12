/**
 * Ruling 31726e97d989259d — Hextech Ray (OGN-009 → ogn-009-298) · Action · [1][fury]
 *     "Deal 3 to a unit at a battlefield."
 *   × Noxian Drummer (OGN-222 → ogn-222-298) · 3 Might · "When I move to a battlefield, play a 1 [Might]
 *     Recruit unit token here."
 *
 * Q: When the Drummer moves to an empty battlefield, can the opponent play Hextech Ray before the move
 *    trigger resolves?
 * A: No. Hextech Ray is an [Action]: it may only be played in an Open State on your turn or while you hold
 *    Focus in a showdown — never while a trigger sits on the chain. The trigger resolves first; then the
 *    showdown opens with the turn player holding Focus, and only after they pass it can the opponent act.
 * Rules: 347.1 ([Action] timing), 336/340 (a chain makes the state Closed; only [Reaction] speed may be
 *        played there), 344 (Focus in a showdown starts with the turn player).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";
const NOXIAN_DRUMMER = "ogn-222-298";

/** P1's turn. bf1 is open; P1's Drummer waits in base. P2 holds Hextech Ray with exactly [1][fury]. */
function board() {
  return scenario()
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", NOXIAN_DRUMMER, "drummer")
    .hand(P2, HEXTECH_RAY, "ray");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

describe("Ruling 31726e97d989259d — an Action cannot be played while a move trigger is on the chain", () => {
  test("the Drummer's move trigger goes on the chain and Hextech Ray is illegal for P2 there, even after P1 passes priority", async () => {
    const game = await board().build();
    await game.p1.move("drummer", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drummer", controller: P1, triggered: true })]);
    expect(game.p2.can("cast", "ray")).toBe(false);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ray")).toBe(false); // Reaction speed only while the chain is live
    expect((await game.p2.try((p) => p.cast("ray", { targets: "drummer" }))).ok).toBe(false);
  });

  test("after the trigger resolves the Recruit token is there and the showdown opens with P1 (the turn player) on Focus — P2 still cannot act", async () => {
    const game = await board().build();
    await game.p1.move("drummer", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority(); // the trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.p1.units("bf1")).toHaveLength(2); // Drummer + Recruit token
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", focusPlayer: P1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p2.can("cast", "ray")).toBe(false);
  });

  test("only once P1 passes Focus does P2 get to play it — and then the 3 damage lands on the 3-Might Drummer and kills it", async () => {
    const game = await board().build();
    await game.p1.move("drummer", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ray")).toBe(true);
    await game.p2.cast("ray", { targets: "drummer" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Hextech Ray resolves
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("drummer")).toBe("trash"); // 3 damage on a 3-Might unit
    await game.settle();
    expect(game.p1.units("bf1")).toHaveLength(1); // the Recruit token holds the battlefield alone
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // nobody contested it
    expect(game.violations()).toEqual([]);
  });
});
