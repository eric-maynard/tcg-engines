/**
 * Ruling 9fd2d2bccb0f81a0 — (no specific card) who gets first priority to play Action spells in combat.
 *   Stand-ins: inline "Test Rally" ([Action] +1 [Might] this turn) in both hands.
 *
 * Q: Who gets first priority to play action spells in combat?
 * A: The attacker. Focus is what lets you play an Action inside a showdown and the attacker gets it first.
 *    Once the attacker either passes or plays something that fully resolves, Focus goes to the defender —
 *    and it keeps alternating until both players pass in succession.
 * Rules: 345 (the player who applied Contested gains Focus), 313.1 (Focus = permission to act in a
 *        Showdown Open State), 347.1.b / 346 (Focus passes when the chain that player opened closes),
 *        348 (all passing in sequence closes the showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RALLY = {
  abilities: [{ effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +1 [Might] this turn.",
  timing: "action",
} as const;

/** P1's turn: a 2-Might Raider attacks P2's 9-Might Guard (nothing dies quickly enough to matter). */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 2, name: "Raider" }, "raider")
    .hand(P1, RALLY, "act1")
    .hand(P2, RALLY, "act2");
}

function focusPlayer(game: Game): string | undefined {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1)?.focusPlayer;
}

async function open(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  return game;
}

describe("Ruling 9fd2d2bccb0f81a0 — the attacker receives Focus first, and Focus alternates from there", () => {
  test("the attacker receives Focus, which is what makes an Action legal for them and not for the defender", async () => {
    const game = await open();
    expect(focusPlayer(game)).toBe(P1);
    expect(game.p1.can("cast", "act1")).toBe(true);
    expect(game.p2.can("cast", "act2")).toBe(false);
  });

  test("if the attacker passes, Focus goes to the defender immediately", async () => {
    const game = await open();
    await game.p1.passFocus();
    expect(focusPlayer(game)).toBe(P2);
    expect(game.p2.can("cast", "act2")).toBe(true);
  });

  test("if the attacker plays instead, Focus goes to the defender only once that chain has fully resolved", async () => {
    const game = await open();
    await game.p1.cast("act1", { targets: "raider" });
    expect(focusPlayer(game)).toBe(P1); // still theirs while their own chain is live
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("raider").might).toBe(3);
    expect(focusPlayer(game)).toBe(P2);
  });

  test("Focus keeps changing hands until both pass in succession, and only then does combat finish", async () => {
    const game = await open();
    await game.p1.cast("act1", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p2.cast("act2", { targets: "guard" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(focusPlayer(game)).toBe(P1); // back to the attacker
    await game.p1.passFocus();
    expect(focusPlayer(game)).toBe(P2);
    expect(game.zoneOf("raider")).toBe("battlefield-bf1"); // one pass is not the end
    await game.p2.passFocus();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.state("guard").zone).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });
});
