/**
 * Ruling cf99a3ca7bd7d3f0 — Viktor, Innovator (OGN-117 → ogn-117-298) · 3 Might "When you play a card on an opponent's turn, play a
 *   1 [Might] Recruit unit token in your base."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · Action [2] · [Hidden] "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: Does Viktor trigger when I play a card from Hidden (Hidden Blade) on the opponent's turn?
 * A: Yes — playing a card from facedown is still playing a card, so Viktor makes a Recruit. (Hiding the card in the first place
 *    is NOT playing a card.)
 * Rules: 811.1.c (a Hidden card is PLAYED from facedown), 811.2 (hiding is its own action, not a play), 419 (playing cards).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VIKTOR = "ogn-117-298";
const HIDDEN_BLADE = "ogn-213-298";

const recruitsOf = (game: Game) => game.p1.units("base").filter((u) => game.state(u).name === "Recruit");

/** P2's turn. P1: Viktor in base, Guard at bf1 with Hidden Blade facedown there. P2's Raider (4) in base. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", VIKTOR, "viktor")
    .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider");
}

/** Raider attacks; P2 passes Focus; P1 flips Hidden Blade at the Raider. Returns with the Blade on the chain. */
async function flipBladeAtRaider(): Promise<{ game: Game; energyBefore: number }> {
  const game = await board().build();
  expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
  await game.p2.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "blade")).toBe(true);
  const energyBefore = game.p1.energy();
  await game.p1.reveal("blade", { answers: ["raider"] });
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("raider");
  }
  expect(game.chain().map((c) => c.cardId)).toContain("blade");
  return { energyBefore, game };
}

describe("Ruling cf99a3ca7bd7d3f0 — playing Hidden Blade from facedown on the opponent's turn triggers Viktor, Innovator", () => {
  test("P2 attacks bf1; P1 flips the facedown Hidden Blade (for [0]) killing the attacker → that is a card PLAYED on P2's turn → Viktor's trigger → a 1-Might Recruit token in P1's base", async () => {
    const { game, energyBefore } = await flipBladeAtRaider();
    expect(game.p1.energy()).toBe(energyBefore); // played from Hidden for [0]
    const p2Hand = game.p2.hand().length;
    // Once it resolves, Viktor's "when you play a card on an opponent's turn" goes on the chain.
    for (let i = 0; i < 6 && !game.chain().some((c) => c.cardId === "viktor"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2); // "Its controller draws 2"
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "viktor", controller: P1, triggered: true })]);
    await game.settle();
    const recruits = recruitsOf(game);
    expect(recruits).toHaveLength(1);
    expect(game.state(recruits[0] as string)).toMatchObject({ isToken: true, location: "base", might: 1 });
    expect(game.violations()).toEqual([]);
  });

  // Expected: a play from Hidden is a play like any other, so P1's "cards played this turn" tally (Legion etc., 419.4.b) reads 1
  // once the Blade is finalized. Actual: the reveal/hidden play path never bumps `cardsPlayedThisTurn` (it stays 0), even
  // though Viktor's play trigger fires.
  test("ruling cf99a3ca7bd7d3f0 — a card played from Hidden is not counted in the played-this-turn tally", async () => {
    const { game } = await flipBladeAtRaider();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  });

  test("nuance: HIDING the card is not playing it — no play is recorded, nothing triggers, no Recruit", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", VIKTOR, "viktor")
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .hand(P1, HIDDEN_BLADE, "blade")
      .build();
    expect(game.p1.can("hide", "blade")).toBe(true);
    await game.p1.hide("blade", "bf1");
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    expect(game.p1.power("rainbow")).toBe(0); // paid the hide cost
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0); // not a play
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(recruitsOf(game)).toEqual([]);
  });
});
