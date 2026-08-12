/**
 * Ruling 80cc4731e29685a9 — (no specific card) who may play an Action spell as a showdown opens.
 *   Stand-ins: inline "Test Rally" ([Action] give a unit +1 [Might] this turn) and "Test Reflex"
 *   ([Reaction] give a unit +2 [Might] this turn) in both hands.
 *
 * Q: Who has priority to play an action spell at the beginning of combat/showdown?
 * A: The ATTACKER gains Focus as the showdown starts and acts first — the defender may not slip in ahead
 *    of them. If the attacker passes, the defender may then start a chain; when that chain fully resolves
 *    Focus goes to the other player, so a defender who spent a Reaction does not keep priority to start a
 *    new chain with an Action.
 * Rules: 345 (the player who applied Contested gains Focus = the attacker), 313.1 (Focus is the permission
 *        to act in a Showdown Open State), 347.1 / 347.1.b (with Focus: play something, then Focus passes
 *        when that chain closes), 346 (chain empties in a showdown → next player gains Focus AND priority),
 *        806.1.b ([Action] may be played in showdowns on any player's turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ACTION_SPELL = {
  abilities: [{ effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +1 [Might] this turn.",
  timing: "action",
} as const;

const REACTION_SPELL = {
  abilities: [{ effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Reflex",
  rulesText: "[Reaction] Give a unit +2 [Might] this turn.",
  timing: "reaction",
} as const;

/** P1's turn. P2 holds bf1 with a 5-Might Guard; P1's 4-Might Raider walks in. Both hold one Action and one Reaction. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, ACTION_SPELL, "act1")
    .hand(P1, REACTION_SPELL, "react1")
    .hand(P2, ACTION_SPELL, "act2")
    .hand(P2, REACTION_SPELL, "react2");
}

function focusPlayer(game: Game): string | undefined {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1)?.focusPlayer;
}

async function showdownOpen(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(game.chain()).toEqual([]); // no attack/defend triggers on this board
  return game;
}

describe("Ruling 80cc4731e29685a9 — the attacker gains Focus as the showdown opens and plays first", () => {
  test("the moment the showdown opens the ATTACKER holds Focus: P1 may play an Action or a Reaction, and P2 may play nothing at all", async () => {
    const game = await showdownOpen();
    expect(focusPlayer(game)).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "act1")).toBe(true);
    expect(game.p1.can("cast", "react1")).toBe(true);
    expect(game.p2.can("cast", "act2")).toBe(false);
    expect(game.p2.can("cast", "react2")).toBe(false);
    expect((await game.p2.try((p) => p.cast("react2", { targets: "guard" }))).ok).toBe(false);
  });

  test("if the attacker declines and passes Focus, the DEFENDER gets Focus and may then start a chain with an Action — even though it is not their turn", async () => {
    const game = await showdownOpen();
    await game.p1.passFocus();
    expect(focusPlayer(game)).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "act2")).toBe(true);
    expect(game.p1.can("cast", "act1")).toBe(false); // P1 gave up the Focus
    expect(game.p1.can("cast", "react1")).toBe(false); // …and no chain exists to react to yet
  });

  test("attacker passes, defender plays a Reaction: it resolves and Focus goes BACK to the attacker — the defender does not keep priority to start a second chain", async () => {
    const game = await showdownOpen();
    await game.p1.passFocus();
    await game.p2.cast("react2", { targets: "guard" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "react2", controller: P2 })]);
    // P1 may answer that chain with a Reaction, never with an Action (309.2 / 806.1.b)
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "react1")).toBe(true);
    expect(game.p1.can("cast", "act1")).toBe(false);
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").might).toBe(7); // the Reaction did resolve
    // 346 — the chain emptied inside the showdown, so Focus moves on to the attacker
    expect(focusPlayer(game)).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p2.can("cast", "act2")).toBe(false);
    expect(game.p1.can("cast", "act1")).toBe(true);
  });

  test("and when the attacker's own Action resolves, Focus passes to the defender — it tracks who acted last, not whose turn it is", async () => {
    const game = await showdownOpen();
    await game.p1.cast("act1", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("raider").might).toBe(5);
    expect(focusPlayer(game)).toBe(P2);
    expect(game.p2.can("cast", "act2")).toBe(true); // an [Action] on the opponent's turn (806.1.b)
    expect(game.violations()).toEqual([]);
  });
});
