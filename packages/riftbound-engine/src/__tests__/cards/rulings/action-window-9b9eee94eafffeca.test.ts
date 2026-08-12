/**
 * Ruling 9b9eee94eafffeca — (general timing; no specific card)
 *   Stand-ins: an inline [Action] spell and an inline [Reaction] spell, on the opponent's turn.
 *
 * Q: Outside combat/showdown, can I play an action after my opponent's spell or ability resolves?
 * A: No. Actions can never be played while there is a chain, and outside a showdown no window opens for the
 *    non-turn player once the chain has emptied — play simply returns to the turn player's open main phase.
 *    Reactions are the only thing the non-turn player may put on that chain.
 * Rules: 444.1 (Action timing: your turn, Open State, or a showdown you have Focus in), 444.2 (Reaction timing),
 *        340 / 341 (a chain resolves, then the Open State returns to the turn player).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ACTION_BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Action Bolt",
  rulesText: "[Action] Deal 2 to a unit.",
  timing: "action",
} as const;

const REACTION_BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Reaction Bolt",
  rulesText: "[Reaction] Deal 2 to a unit.",
  timing: "reaction",
} as const;

/** P2's turn, no showdown anywhere. P1 holds one Action and one Reaction. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 4, power: { fury: 4 } })
    .resources(P2, { energy: 4, power: { fury: 4 } })
    .unit(P1, "base", { might: 5, name: "Dummy" }, "dummy")
    .unit(P2, "base", { might: 5, name: "Theirs" }, "theirs")
    .hand(P1, ACTION_BOLT, "act")
    .hand(P1, REACTION_BOLT, "react")
    .hand(P2, ACTION_BOLT, "theirAct");
}

/** P2 casts their action and passes: P1 holds priority with a chain up. */
async function onTheirChain(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("theirAct", { targets: "dummy" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 9b9eee94eafffeca — outside a showdown there is no action window for the non-turn player", () => {
  test("on the opponent's turn, before anything is played, my Action is not castable at all", async () => {
    const game = await board().build();
    expect(game.p2.isTurnPlayer()).toBe(true);
    expect(game.p1.can("cast", "act")).toBe(false);
  });

  test("while their spell is on the chain I may play a REACTION but never an ACTION", async () => {
    const game = await onTheirChain();
    expect(game.p1.can("cast", "act")).toBe(false);
    expect(game.p1.can("cast", "react")).toBe(true);
    const refused = await game.p1.try((p) => p.cast("act", { targets: "theirs" }));
    expect(refused.ok).toBe(false);
  });

  test("after their spell resolves the Open State belongs to the TURN PLAYER — the chain emptied and I was never offered a window", async () => {
    const game = await onTheirChain();
    await game.p1.passPriority();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("dummy").damage).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", seat: P2 });
    expect(game.p1.can("cast", "act")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("on MY OWN turn, in an open state with an empty chain, the same Action is castable — the restriction is about whose turn it is", async () => {
    const game = await scenario()
      .active(P1)
      .resources(P1, { energy: 4, power: { fury: 4 } })
      .unit(P2, "base", { might: 5, name: "Theirs" }, "theirs")
      .hand(P1, ACTION_BOLT, "act")
      .build();
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("cast", "act")).toBe(true);
  });
});
