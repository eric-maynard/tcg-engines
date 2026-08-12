/**
 * Ruling 8eb54a85c9551624 — (no specific card) does one pass lock the attacker out of the showdown?
 *   Stand-ins: inline "Test Shen" ([Reaction] give a unit +2 [Might] this turn) for the defender and
 *   "Test Rally" ([Action] +2 [Might] this turn) for the attacker.
 *
 * Q: The attacker passes, the defender plays a Reaction — once it resolves, may the attacker still act, or
 *    did they spend their chance?
 * A: They may still act. When the chain empties inside a showdown the turn hands Focus and priority to the
 *    other player, so it comes back to the attacker. A single pass locks nobody out; only two passes in a
 *    row on an empty chain end the showdown and let damage happen.
 * Rules: 346 (chain empties in a showdown → the next player gains Focus AND priority), 347.1.b (Focus
 *        passes when the chain a player opened closes), 348 / 347.2.a (all players passing in sequence
 *        closes the showdown), 463 (only then do the remaining steps of combat run).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHEN_LIKE = {
  abilities: [{ effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 0,
  name: "Test Shen",
  rulesText: "[Reaction] Give a unit +2 [Might] this turn.",
  timing: "reaction",
} as const;

const RALLY = {
  abilities: [{ effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +2 [Might] this turn.",
  timing: "action",
} as const;

/** P1's turn: a 4-Might Raider attacks P2's 3-Might Guard. P2 holds the Reaction, P1 the Action. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P2, SHEN_LIKE, "shen")
    .hand(P1, RALLY, "rally");
}

function focusPlayer(game: Game): string | undefined {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1)?.focusPlayer;
}

async function afterDefendersReaction(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  await game.p1.passFocus(); // the attacker declines the first window
  await game.p2.cast("shen", { targets: "guard" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.chain()).toEqual([]);
  expect(game.state("guard").might).toBe(5); // the Reaction resolved
  return game;
}

describe("Ruling 8eb54a85c9551624 — after the defender's Reaction resolves, Focus and priority come back to the attacker", () => {
  test("the attacker's earlier pass did not end their showdown: Focus is theirs again and their Action is legal", async () => {
    const game = await afterDefendersReaction();
    expect(focusPlayer(game)).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "rally")).toBe(true);
    expect(game.p2.can("cast", "shen")).toBe(false); // the other seat holds nothing right now
  });

  test("the attacker uses it: 4 + 2 = 6 beats the buffed 5-Might Guard, which the single pass would have cost them", async () => {
    const game = await afterDefendersReaction();
    await game.p1.cast("rally", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("raider").might).toBe(6);
    // …Focus now belongs to the defender again; both pass and combat resolves
    expect(focusPlayer(game)).toBe(P2);
    await game.p2.passFocus();
    await game.p1.passFocus();
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("damage waits for two consecutive passes: the attacker declining this second window is what finally ends it", async () => {
    const game = await afterDefendersReaction();
    await game.p1.passFocus();
    expect(focusPlayer(game)).toBe(P2); // still alive — one pass is not enough
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.state("guard").damage).toBe(0);
    await game.p2.passFocus();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 5-Might Guard beat the un-Rallied 4
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });
});
