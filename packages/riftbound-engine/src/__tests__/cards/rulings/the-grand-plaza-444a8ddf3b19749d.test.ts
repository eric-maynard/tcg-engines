/**
 * Ruling 444a8ddf3b19749d — The Grand Plaza (OGN-293 → ogn-293-298) · Battlefield
 *     "When you hold here, if you have 7+ units here, you win the game."
 *
 * Q: Is the "7+ units" condition checked when deciding whether the ability triggers / goes on the chain, or on resolution?
 * A: At the moment you hold: with 7+ units the ability is placed on the chain; with fewer it never triggers at all — so there
 *    is no priority window in which to add units to reach 7 (the condition is a gatekeeper, part of the trigger condition).
 * Rules: 383.2.a.1 (an "if" right after the trigger condition is part of the condition — checked when the event happens),
 *        469.2 / 471.2.b (hold, hold triggers), 315.2 (Beginning Phase).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GRAND_PLAZA = "ogn-293-298";
const GUST = "ogn-169-298"; // Reaction: return a unit at a battlefield with 3 or less Might to its owner's hand

/** P2 is about to end turn 2. P1 controls the live Plaza with `n` 1-Might Citizens (c0…). */
function plaza(n: number) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .battlefield("plaza", { controller: P1, def: GRAND_PLAZA, inert: false, owner: P1 })
    .battlefield("other", { controller: null });
  for (let i = 0; i < n; i++) {
    b.unit(P1, "plaza", { might: 1, name: `Citizen ${i}` }, `c${i}`);
  }
  return b;
}

describe("Ruling 444a8ddf3b19749d — the Plaza's '7+ units' is checked when you hold (trigger time), not on resolution", () => {
  test("7 units when P1 holds: the ability IS placed on the chain during P1's Beginning Phase, then resolves and P1 wins", async () => {
    const game = await plaza(7).victoryScore(8).build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "plaza", controller: P1, triggered: true })]);
    expect(game.isOver()).toBe(false);
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.winner()).toBe(P1);
  });

  test("6 units when P1 holds: the ability does NOT trigger — nothing goes on the chain, so there is no priority window at all; P1 just scores the hold point and reaches the main phase", async () => {
    const game = await plaza(6).unit(P1, "base", { might: 1, name: "Late Citizen" }, "late").build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]); // gatekeeper: never a Pending Item
    expect(game.decision()?.kind === "action" ? game.decision() : null).not.toMatchObject({ context: "chain" });
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    // Moving a 7th unit in now (main phase) is too late for this turn's hold.
    await game.p1.move("late", "plaza");
    await game.settle();
    expect(game.p1.units("plaza")).toHaveLength(7);
    expect(game.isOver()).toBe(false);
  });

  test("checked at trigger time, not re-checked on resolution: P2 Gusts a Citizen away IN RESPONSE (6 left) — the item already on the chain still resolves and P1 wins", async () => {
    const game = await plaza(7).rune(P2, "chaos", { alias: "p2rune" }).hand(P2, GUST, "gust").build();
    await game.p2.endTurn();
    expect(game.chain().map((i) => i.cardId)).toEqual(["plaza"]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.tapRune("p2rune");
    await game.p2.cast("gust", { targets: "c0" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["plaza", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves (LIFO)
    expect(game.zoneOf("c0")).toBe("hand");
    expect(game.p1.units("plaza")).toHaveLength(6);
    expect(game.isOver()).toBe(false);
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});
