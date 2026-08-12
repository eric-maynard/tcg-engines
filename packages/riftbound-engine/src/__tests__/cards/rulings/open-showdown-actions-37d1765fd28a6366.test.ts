/**
 * Ruling 37d1765fd28a6366 — (no specific card) playing an [Action] while an opponent conquers an open battlefield.
 *   Exercised with inline [Action] "Deal 5 to a unit" and [Reaction] "Give a unit +1 [Might] this turn" spells.
 *
 * Q: Can you play an [Action] when an opponent conquers an OPEN (unoccupied, uncontrolled) battlefield?
 * A: Yes. Moving a unit to an open battlefield stages a NON-COMBAT showdown. The mover (who applied
 *    Contested) has Focus first; when they pass it you get Focus and may start a chain with an
 *    [Action] or a [Reaction] — enough to remove the unit and deny the conquer. The showdown (and the
 *    conquer) only settle once both players pass Focus in succession.
 * Rules: 344.2 (showdown staged), 345 (Focus to the player who applied Contested), 358.3, 348.2.a.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** [Action] "Deal 5 to a unit." */
const BOLT = {
  abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt",
  rulesText: "[Action] Deal 5 to a unit.",
  timing: "action",
} as const;

/** [Reaction] "Give a unit +1 [Might] this turn." */
const BRACE = {
  abilities: [
    {
      effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "order",
  energyCost: 0,
  name: "Test Brace",
  rulesText: "[Reaction] Give a unit +1 [Might] this turn.",
  timing: "reaction",
} as const;

function focus(game: Game): string | undefined {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1)?.focusPlayer;
}

/** P1 (turn player) walks a 3-Might Scout onto the open battlefield bf1. P2 holds an Action and a Reaction. */
async function openShowdown(): Promise<Game> {
  const game = await scenario()
    .battlefield("bf1")
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .hand(P2, BOLT, "bolt")
    .hand(P2, BRACE, "brace")
    .hand(P1, BRACE, "p1brace")
    .build();
  await game.p1.move("scout", "bf1");
  expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  expect(focus(game)).toBe(P1); // the mover applied Contested and holds Focus
  return game;
}

describe("Ruling 37d1765fd28a6366 — an open (non-combat) showdown lets the other player play [Action] and [Reaction] cards", () => {
  test("the mover has Focus first; once they pass it, the opponent may start a chain with an [Action] — or with a [Reaction]", async () => {
    const game = await openShowdown();
    expect(game.p2.can("cast", "bolt")).toBe(false); // Focus is P1's
    await game.p1.passFocus();
    expect(focus(game)).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "bolt")).toBe(true);
    expect(game.p2.can("cast", "brace")).toBe(true);
  });

  test("the [Action] can remove the lone unit and deny the conquer: bf1 ends up uncontrolled and P1 scores nothing", async () => {
    const game = await openShowdown();
    expect(game.p1.points()).toBe(0);
    await game.p1.passFocus();
    await game.p2.cast("bolt", { targets: "scout" });
    // P1 may answer on the same chain with a Reaction before it resolves.
    await game.p2.passPriority();
    expect(game.p1.can("cast", "p1brace")).toBe(true);
    await game.p1.passPriority();
    expect(game.zoneOf("scout")).toBe("trash"); // 5 ≥ 3 Might
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBeFalsy();
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("if nobody removes the unit, both players passing Focus closes the showdown and P1 conquers and scores", async () => {
    const game = await openShowdown();
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
