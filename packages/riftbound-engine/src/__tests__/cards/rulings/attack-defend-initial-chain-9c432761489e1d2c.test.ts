/**
 * Ruling 9c432761489e1d2c — (no specific card) Attack/Defend triggers versus Action-speed cards.
 *   Stand-ins: inline "Test Vanguard" (When I attack, draw 1) and "Test Bulwark" (When I defend, draw 1),
 *   plus "Test Rally" ([Action] +1 [Might]) and "Test Reflex" ([Reaction] +2 [Might]) in both hands.
 *
 * Q: Do Attack/Defend triggers resolve before Actions can be played, or can an Action answer them?
 * A: They resolve first. Combat opens by putting the Attack triggers on the initial chain with the Defend
 *    triggers on top of them, and an Action can never be played while a chain exists — only Reactions can
 *    join it. Once that initial chain has emptied, the attacker takes Focus and priority as usual.
 * Rules: 383.4.e / 464.2.c (Attack and Defend triggers as combat opens), 309.2 (a chain means the turn is
 *        not in an Open State), 806.1.b (Action needs an Open State), 813 (Reaction does not), 340.1 (LIFO),
 *        346.1 (Focus does NOT pass when the chain opened from triggered abilities — the combat chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ATTACK_DRAW = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "attack", on: "self" }, type: "triggered" }],
  cardType: "unit",
  domain: "body",
  energyCost: 2,
  might: 3,
  name: "Test Vanguard",
  rulesText: "When I attack, draw 1.",
} as const;

const DEFEND_DRAW = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "defend", on: "self" }, type: "triggered" }],
  cardType: "unit",
  domain: "body",
  energyCost: 2,
  might: 3,
  name: "Test Bulwark",
  rulesText: "When I defend, draw 1.",
} as const;

const RALLY = {
  abilities: [{ effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +1 [Might] this turn.",
  timing: "action",
} as const;

const REFLEX = {
  abilities: [{ effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Reflex",
  rulesText: "[Reaction] Give a unit +2 [Might] this turn.",
  timing: "reaction",
} as const;

/** P1's turn: the Vanguard attacks bf1, which P2's Bulwark defends. Both hands hold an Action and a Reaction. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", DEFEND_DRAW, "bul")
    .unit(P1, "base", ATTACK_DRAW, "van")
    .hand(P1, RALLY, "act1")
    .hand(P1, REFLEX, "react1")
    .hand(P2, RALLY, "act2")
    .hand(P2, REFLEX, "react2");
}

/** One priority round-trip on the chain: whoever holds it passes, then the other seat. */
async function passBoth(game: Game): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain") return;
    await game.seat(d.seat).passPriority();
  }
}

async function combatOpens(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("van", "bf1");
  return game;
}

describe("Ruling 9c432761489e1d2c — the initial chain of Attack/Defend triggers resolves before any Action", () => {
  test("combat opens with both triggers already on the chain: the Attack trigger at the bottom, the Defend trigger on top of it", async () => {
    const game = await combatOpens();
    expect(game.chain().map((c) => [c.cardId, c.controller, c.triggered])).toEqual([
      ["van", P1, true],
      ["bul", P2, true],
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("no Action may be played against them — for either player — because a chain exists; Reactions may", async () => {
    const game = await combatOpens();
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (!d || d.kind !== "action" || d.context !== "chain") break;
      expect(game.p1.can("cast", "act1")).toBe(false);
      expect(game.p2.can("cast", "act2")).toBe(false);
      const seat = d.seat === P1 ? game.p1 : game.p2;
      expect(seat.can("cast", d.seat === P1 ? "react1" : "react2")).toBe(true); // Reactions are fine
      await game.seat(d.seat).passPriority();
    }
    expect(game.chain()).toEqual([]);
  });

  test("both triggers do resolve — the Defend trigger first (it is newest) and the Attack trigger under it", async () => {
    const game = await combatOpens();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await passBoth(game);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1); // Defend trigger resolved first
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.chain().map((c) => c.cardId)).toEqual(["van"]);
    await passBoth(game);
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.chain()).toEqual([]);
  });

  test("only once the initial chain is empty does the ATTACKER take Focus and priority, and their Action becomes legal", async () => {
    const game = await combatOpens();
    await passBoth(game);
    await passBoth(game);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect((game.gameState.interaction?.showdownStack ?? []).at(-1)?.focusPlayer).toBe(P1);
    expect(game.p1.can("cast", "act1")).toBe(true);
    expect(game.p2.can("cast", "act2")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
