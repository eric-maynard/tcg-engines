/**
 * Ruling 3db6337e7d4c5c77 — Teemo, Strategist (OGN-121 → ogn-121-298)
 *   "[Hidden] When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck.
 *    Deal 1 to that unit for each card with [Hidden] revealed this way, then recycle the revealed cards."
 *   Deck stacked with 5 × Tideturner (ogn-199-298, a [Hidden] card) so the trigger deals exactly 5.
 *
 * Q: If the defending Teemo's "when I defend" trigger kills the attacking unit during the initial
 *    chain, does combat end immediately or does another chain open for Actions?
 * A: The showdown ends only when both players pass Focus in succession. Losing every unit on one
 *    side does not end it: after the initial chain resolves, Focus/priority are handed out again and
 *    Actions may still be played.
 * Rules: 348.2 (a showdown closes on consecutive Focus passes), 345–347, 466.5.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO = "ogn-121-298";
const TIDETURNER = "ogn-199-298"; // a [Hidden] card — five of them make Teemo's trigger deal 5

/** [Action] "Give a unit +2 [Might] this turn." — proof that Actions are still playable. */
const RALLY = {
  abilities: [
    {
      effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +2 [Might] this turn.",
  timing: "action",
} as const;

function focus(game: Game): string | undefined {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1)?.focusPlayer;
}

/** P1's 3-Might Raider attacks Teemo at P2's bf1; P1 also keeps a spare unit in base and an Action. */
async function combat(): Promise<Game> {
  const game = await scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", TEEMO, "teemo")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P1, "base", { might: 2, name: "Reserve" }, "reserve")
    .deck(P2, [TIDETURNER, TIDETURNER, TIDETURNER, TIDETURNER, TIDETURNER])
    .hand(P1, RALLY, "rally")
    .hand(P2, RALLY, "p2rally")
    .build();
  await game.p1.move("raider", "bf1");
  // Teemo's defend trigger is the initial chain; the Raider is its only legal target.
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P2, triggered: true })]);
  return game;
}

describe("Ruling 3db6337e7d4c5c77 — killing the attacker in the initial chain does NOT end the showdown", () => {
  test("the attacker dies to the defend trigger, yet the showdown stays open and Focus comes back to the attacker", async () => {
    const game = await combat();
    await game.p2.passPriority();
    await game.p1.passPriority(); // the defend trigger resolves: 5 damage on a 3-Might attacker
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.chain()).toEqual([]);
    // Combat did not end: the showdown is still on the stack and Focus was handed out again.
    expect(game.gameState.interaction?.showdownStack?.some((s) => s.active)).toBe(true);
    expect(focus(game)).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    // …and the attacker — with no unit left at bf1 — may still start a chain with an Action.
    expect(game.p1.can("cast", "rally")).toBe(true);
    await game.p1.cast("rally", { targets: "reserve" });
    await game.settle();
    expect(game.state("reserve").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });

  test("it takes BOTH players passing Focus in succession to close it — one pass only hands Focus over", async () => {
    const game = await combat();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("raider")).toBe("trash");
    await game.p1.passFocus();
    expect(game.gameState.interaction?.showdownStack?.some((s) => s.active)).toBe(true); // still open
    expect(focus(game)).toBe(P2);
    expect(game.p2.can("cast", "p2rally")).toBe(true); // the defender gets a chain window too
    await game.p2.passFocus();
    await game.settle();
    expect(game.gameState.interaction?.showdownStack?.some((s) => s.active)).toBeFalsy();
    // No attacker survived: the defender simply keeps bf1 and nobody conquers.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });
});
