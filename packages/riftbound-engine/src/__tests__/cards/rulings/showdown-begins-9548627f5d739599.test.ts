/**
 * Ruling 9548627f5d739599 — (no specific card) what counts as a Showdown beginning?
 *   Exercised with vanilla units plus an inline "Test Outrider" ("When I move, draw 1.") whose
 *   trigger holds the state Closed, and an inline [Reaction] "Deal 1 to a unit."
 *
 * Q: What counts as a Showdown beginning?
 * A: A Showdown begins when a battlefield is Contested and the turn reaches a Neutral OPEN state.
 *    Moving into a battlefield an opponent occupies opens a COMBAT showdown; moving into an empty
 *    or uncontrolled one opens a NON-combat showdown. Moving into a battlefield you already
 *    control is a reinforcement and opens nothing. If a chain is live when the battlefield becomes
 *    contested, the showdown is merely STAGED and waits for the chain to empty. Only one showdown
 *    exists at a time. When it begins, the player who applied Contested holds Focus.
 * Rules: 344 / 344.1 / 344.2 (when and which kind), 323.11–323.13 (staged, opened in a Cleanup in
 *        a Neutral Open State; one at a time), 345 (the contester gains Focus), 464.2.c.3
 *        (designations are stamped only for a Combat).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const OUTRIDER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "move", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 4,
  name: "Test Outrider",
  rulesText: "When I move, draw 1.",
} as const;

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** bfEnemy is P2's (a 9-Might Wall), bfOpen is uncontrolled and empty, bfMine is P1's with a holder. */
const board = () =>
  scenario()
    .battlefield("bfEnemy", { controller: P2 })
    .battlefield("bfOpen", { controller: null })
    .battlefield("bfMine", { controller: P1 })
    .unit(P2, "bfEnemy", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "bfMine", { might: 4, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 4, name: "Scout" }, "scout")
    .unit(P1, "base", { might: 4, name: "Runner" }, "runner");

describe("Ruling 9548627f5d739599 — when a Showdown begins, and which kind", () => {
  test("moving into a battlefield the opponent occupies opens a COMBAT showdown, contester holds Focus, designations stamped", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bfEnemy");
    expect(showdown(game)).toMatchObject({
      active: true,
      battlefieldId: "bfEnemy",
      focusPlayer: P1,
      isCombatShowdown: true,
    });
    expect(game.gameState.battlefields.bfEnemy?.contested).toBe(true);
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("wall").combatRole).toBe("defender");
  });

  test("moving onto an empty uncontrolled battlefield opens a NON-combat showdown — contested, but nobody is designated", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bfOpen");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfOpen", isCombatShowdown: false });
    expect(game.gameState.battlefields.bfOpen?.contested).toBe(true);
    expect(game.state("scout").combatRole).toBeNull();
  });

  test("moving to a battlefield you already control is a reinforcement — no Contested, no showdown at all", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bfMine");
    expect(showdown(game)?.active).toBeFalsy();
    expect(game.gameState.battlefields.bfMine).toMatchObject({ contested: false, controller: P1 });
    expect(game.state("scout").combatRole).toBeNull();
    expect(game.decision()).toMatchObject({ context: "main", seat: P1 });
  });

  test("with a chain live the showdown is only STAGED — it opens in the Cleanup after the chain empties", async () => {
    const game = await board().unit(P1, "base", OUTRIDER, "outrider").build();
    await game.p1.move("outrider", "bfEnemy");
    expect(game.chain().map((i) => i.cardId)).toEqual(["outrider"]); // the state is Closed
    expect(showdown(game)?.active).toBeFalsy(); // staged, not begun
    expect(game.state("outrider").combatRole).toBeNull();
    expect(game.gameState.battlefields.bfEnemy?.contested).toBe(true); // Contested applied at once
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfEnemy", isCombatShowdown: true });
    expect(game.state("outrider").combatRole).toBe("attacker");
  });

  test("only one showdown at a time: while one is open, another move is not available to start a second", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bfEnemy");
    expect(showdown(game)?.active).toBe(true);
    const denied = await game.p1.try((p) => p.move("runner", "bfOpen"));
    expect(denied.ok).toBe(false); // Standard Moves need a Neutral Open State
    expect(game.locationOf("runner")).toBe("base");
    await game.settle();
    expect(game.violations()).toEqual([]);
  });
});
