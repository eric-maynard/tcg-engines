/**
 * Ruling 74142ecbe3c8b685 — Baron Nashor (UNL-147 → unl-147-219) · Unit · [10][chaos][chaos][chaos] · 12 Might
 *   "As you play me, add the Baron Pit battlefield token to the board if it's not there already. If you do, I enter
 *    there. … I can't be chosen by enemy spells and abilities. Other friendly units have +2 [Might]."
 *
 * Q: Does Baron come in exhausted, or can he gank right away?
 * A: Exhausted, and he cannot gank. Units enter exhausted unless an effect says otherwise, and Baron's text says
 *    nothing about entering ready. A Gank is a modified Standard Move, whose cost is exhausting the unit — an
 *    already-exhausted unit cannot pay it. He also has no [Ganking] to begin with. He readies in your next Awaken.
 * Rules: 143.4 (units enter exhausted unless an effect says otherwise), 144.2 (Standard Move costs [Exhaust]),
 *        728 ([Ganking] is a modified Standard Move), 315.1 (Awaken Step readies your cards).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BARON_NASHOR = "unl-147-219";
const BARON_PIT = "token-bf-unl-t01";

/** P1's turn with exactly [10][chaos][chaos][chaos] and Baron in hand; P2 holds bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 10, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Theirs" }, "theirs")
    .hand(P1, BARON_NASHOR, "baron");
}

describe("Ruling 74142ecbe3c8b685 — Baron Nashor enters exhausted and cannot gank the turn he arrives", () => {
  test("ruling: Baron arrives at the Baron Pit battlefield token EXHAUSTED — nothing on the card makes him enter ready", async () => {
    const game = await board().build();
    await game.p1.play("baron");
    await game.settle();
    expect(game.battlefields()).toContain(BARON_PIT);
    expect(game.locationOf("baron")).toBe(BARON_PIT);
    expect(game.state("baron")).toMatchObject({ baseMight: 12, controller: P1, isExhausted: true, isReady: false });
    expect(game.gameState.battlefields[BARON_PIT]?.controller).toBe(P1);
  });

  test("consequence: he has no [Ganking] and, being exhausted, cannot pay a Standard/Gank move's cost — the seat is offered no move at all", async () => {
    const game = await board().build();
    await game.p1.play("baron");
    await game.settle();
    expect(game.state("baron").keywords).not.toContain("Ganking");
    expect(game.p1.legal().some((o) => o.verb === "move" || o.verb === "gank")).toBe(false);
    expect((await game.p1.try((p) => p.gank("baron", "bf1"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.move("baron", "bf1"))).ok).toBe(false);
    expect(game.locationOf("baron")).toBe(BARON_PIT);
  });

  test("he readies in P1's NEXT Awaken Step, and only then may he act", async () => {
    const game = await board().build();
    await game.p1.play("baron");
    await game.settle();
    await game.advanceTurn(); // P1 ends → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("baron").isExhausted).toBe(true); // still spent on the opponent's turn
    await game.advanceTurn(); // P2 ends → P1's Awaken readies him
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("baron")).toMatchObject({ isExhausted: false, isReady: true });
    expect(game.violations()).toEqual([]);
  });
});
