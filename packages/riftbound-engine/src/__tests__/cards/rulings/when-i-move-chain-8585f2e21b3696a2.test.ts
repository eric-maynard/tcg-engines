/**
 * Ruling 8585f2e21b3696a2 — (no specific card) do "When I move" abilities resolve instantly?
 *   Exercised with an inline "Test Outrider" — 4 Might, "When I move, draw 1."
 *
 * Q: Does a "When I move" ability resolve instantly?
 * A: No. The MOVE itself is instantaneous and uses no chain — the unit is at its destination at
 *    once — but the "when I move" TRIGGER is a triggered ability that goes on the chain, so it
 *    resolves under normal LIFO chain rules and players may react to it first. The chain must be
 *    empty again before the staged Showdown/Combat that move created can begin.
 * Rules: 424.3 / 447 (moving is instantaneous, no chain), 383 (triggered abilities are placed on
 *        the chain), 336–340 (LIFO resolution, priority), 344 / 323.11-323.13 (a showdown is
 *        STAGED and only opens in a Cleanup in a Neutral OPEN State — i.e. once the chain is gone).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** 4 Might · "When I move, draw 1." */
const OUTRIDER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "move", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 4,
  name: "Test Outrider",
  rulesText: "When I move, draw 1.",
} as const;

/** [Reaction] "Deal 1 to a unit." — proof that the trigger can be answered while it sits on the chain. */
const STING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Sting",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1's turn. bf1 is P2's, held by a 9-Might Wall so nothing dies; P2 holds a reaction. */
const board = () =>
  scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", OUTRIDER, "outrider")
    .hand(P2, STING, "sting");

describe("Ruling 8585f2e21b3696a2 — the move is instant, its trigger is a chain item", () => {
  test("the MOVE itself is instantaneous: the unit is at the battlefield the moment the move is taken", async () => {
    const game = await board().build();
    await game.p1.move("outrider", "bf1");
    expect(game.locationOf("outrider")).toBe("bf1");
    expect(game.zoneOf("outrider")).toBe("battlefield-bf1");
    expect(game.state("outrider").isExhausted).toBe(true);
  });

  test("the TRIGGER does not resolve instantly — it sits on the chain, undrawn, and priority is offered", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("outrider", "bf1");
    expect(game.chain().map((i) => i.cardId)).toEqual(["outrider"]);
    expect(game.chain()[0]).toMatchObject({ triggered: true });
    expect(game.p1.hand().length).toBe(handBefore); // NOT drawn yet
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("because it is a chain item, the opponent can react to it, and LIFO puts the reaction first", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("outrider", "bf1");
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.cast("sting", { targets: "outrider" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["outrider", "sting"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("outrider").damage).toBe(1); // the reaction resolved FIRST
    expect(game.p1.hand().length).toBe(handBefore); // the move trigger still has not resolved
    expect(game.chain().map((i) => i.cardId)).toEqual(["outrider"]);
  });

  test("the staged Combat waits for the chain: no designations while the trigger is pending, roles only once it is gone", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("outrider", "bf1");
    expect(showdown(game)?.active).toBeFalsy(); // still staged — the state is Closed
    expect(game.state("outrider").combatRole).toBeNull();
    expect(game.state("wall").combatRole).toBeNull();
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves, chain empties
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand().length).toBe(handBefore + 1);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("outrider").combatRole).toBe("attacker");
    expect(game.state("wall").combatRole).toBe("defender");
    expect(game.violations()).toEqual([]);
  });
});
