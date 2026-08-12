/**
 * Ruling 88ab659c42579e0b — (no specific card) what passing Focus costs you in a showdown.
 *   Stand-ins: inline "Test Rally" ([Action] +1 [Might]) and "Test Reflex" ([Reaction] +2 [Might]) in both hands.
 *
 * Q: In a showdown, does the attacker or the defender get Focus first, and what can each side still play
 *    after Focus has been passed?
 * A: The attacker always gains Focus first and may play Action- or Reaction-speed cards. If the attacker
 *    plays something, the defender may only answer with Reactions. If the attacker passes Focus instead,
 *    the defender may open with either speed — and the attacker, having passed, is now limited to Reactions
 *    against whatever the defender starts.
 * Rules: 345 (the contester — the attacker — gains Focus), 313.1 / 347 (only the Focus holder may start
 *        something), 806.1.b / 813 (Action vs Reaction permission), 309.2 (Actions need an empty chain).
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

function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 1, name: "Raider" }, "raider")
    .hand(P1, ACTION_SPELL, "act1")
    .hand(P1, REACTION_SPELL, "react1")
    .hand(P2, ACTION_SPELL, "act2")
    .hand(P2, REACTION_SPELL, "react2");
}

async function open(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  return game;
}

function focusPlayer(game: Game): string | undefined {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1)?.focusPlayer;
}

describe("Ruling 88ab659c42579e0b — the attacker gets Focus first; once you pass it you are down to Reactions", () => {
  test("the attacker declares the showdown and holds Focus: both speeds are open to them, none to the defender", async () => {
    const game = await open();
    expect(focusPlayer(game)).toBe(P1);
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.p1.can("cast", "act1")).toBe(true);
    expect(game.p1.can("cast", "react1")).toBe(true);
    expect(game.p2.legal().some((o) => o.card === "act2" || o.card === "react2")).toBe(false);
  });

  test("attacker plays first → the defender may only respond with a Reaction", async () => {
    const game = await open();
    await game.p1.cast("act1", { targets: "raider" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "react2")).toBe(true);
    expect(game.p2.can("cast", "act2")).toBe(false);
  });

  test("attacker passes Focus → the defender may now start with EITHER speed", async () => {
    const game = await open();
    await game.p1.passFocus();
    expect(focusPlayer(game)).toBe(P2);
    expect(game.p2.can("cast", "act2")).toBe(true);
    expect(game.p2.can("cast", "react2")).toBe(true);
  });

  test("…and the attacker, having passed Focus, can only answer the defender's chain with a Reaction", async () => {
    const game = await open();
    await game.p1.passFocus();
    expect(game.p1.can("cast", "act1")).toBe(false); // no Focus, no chain: nothing at all
    expect(game.p1.can("cast", "react1")).toBe(false);
    await game.p2.cast("act2", { targets: "guard" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "react1")).toBe(true);
    expect(game.p1.can("cast", "act1")).toBe(false);
    expect((await game.p1.try((p) => p.cast("act1", { targets: "raider" }))).ok).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
