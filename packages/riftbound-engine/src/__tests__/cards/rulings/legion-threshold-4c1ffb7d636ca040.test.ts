/**
 * Ruling 4c1ffb7d636ca040 — Dangerous Duo (OGN-016 → ogn-016-298)
 *   "[Legion] — When you play me, give a unit +2 [Might] this turn.
 *    (Get the effect if you've played another card this turn.)"
 *
 * Q: Does a [Legion] card need to be exactly the SECOND card played, or does it also work as the
 *    third, fourth, …?
 * A: [Legion] is simply "you have already played at least one other card from your Main Deck this
 *    turn". Once that is true it stays true — the Legion card may be the third, fourth or any later
 *    card. Played as the FIRST card of the turn, the ability does nothing.
 * Rules: 724.1.c (Legion condition), 724.2 (all-or-nothing across instances).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const DANGEROUS_DUO = "ogn-016-298"; // 3 Energy, 3 Might

/** A free base-speed filler spell: "Draw 1." — something cheap to play first. */
const SCRIBBLE = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  name: "Test Scribble",
  rulesText: "Draw 1.",
  timing: "standard",
} as const;

/** P1 with plenty of Energy, a target Ally in base, three fillers and the Legion unit. */
function board() {
  return scenario()
    .resources(P1, { energy: 9 })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, SCRIBBLE, "f1")
    .hand(P1, SCRIBBLE, "f2")
    .hand(P1, SCRIBBLE, "f3")
    .hand(P1, DANGEROUS_DUO, "duo");
}

/** Play the Duo and answer its (optional) target pick with the Ally. */
async function playDuo(game: Game): Promise<void> {
  await game.p1.play("duo");
  const decision = game.decision();
  if (decision?.timing === "FIN" && decision.kind === "pick") {
    await game.p1.pick("ally");
  }
  await game.settle();
}

describe("Ruling 4c1ffb7d636ca040 — [Legion] is on from the SECOND card onwards, not only on the second", () => {
  test("played as the FIRST card of the turn, the Legion ability does not fire", async () => {
    const game = await board().build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    await playDuo(game);
    expect(game.zoneOf("duo")).toBe("base");
    expect(game.state("ally").might).toBe(2); // no +2
    expect(game.chain()).toEqual([]);
  });

  test("played as the SECOND card, it fires", async () => {
    const game = await board().build();
    await game.p1.cast("f1");
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    await playDuo(game);
    expect(game.state("ally").might).toBe(4);
  });

  test("played as the THIRD or FOURTH card it fires just the same — the count only has to be ≥ 1", async () => {
    const third = await board().build();
    await third.p1.cast("f1");
    await third.settle();
    await third.p1.cast("f2");
    await third.settle();
    expect(third.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
    await playDuo(third);
    expect(third.state("ally").might).toBe(4);

    const fourth = await board().build();
    for (const filler of ["f1", "f2", "f3"]) {
      await fourth.p1.cast(filler);
      await fourth.settle();
    }
    expect(fourth.gameState.cardsPlayedThisTurn?.[P1]).toBe(3);
    await playDuo(fourth);
    expect(fourth.state("ally").might).toBe(4);
    expect(fourth.violations()).toEqual([]);
  });

  test("the ledger is per TURN: a card played last turn does not switch Legion on", async () => {
    const game = await board().build();
    await game.p1.cast("f1");
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    await game.advanceTurn();
    await game.advanceToTurnOf(P1);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    await game.p1.do("addResources", { energy: 9 }); // rune pools empty at the Expiration Step
    await playDuo(game);
    expect(game.state("ally").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
