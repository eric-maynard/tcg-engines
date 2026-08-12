/**
 * Ruling 7cdbd3759d70e5b3 — Darius, Trifarian (OGN-027 → ogn-027-298) · Unit · Fury · [5][fury] · 5 Might
 *     "When you play your second card in a turn, give me +2 [Might] this turn and ready me."
 *
 * Q: Is Darius's ability a triggered ability or a mandatory effect?
 * A: It is a TRIGGERED ability ("When …"), and because it does not say "may" it is mandatory — once the second card of
 *    the turn is played it must go on the Chain. Darius counts himself if he is the second card, and it triggers only
 *    on the second card, not on the third or later.
 * Rules: 383 (triggered abilities), 383.3.a ("you may" is what makes a trigger optional), 419.4 (a card is played once
 *        its play process finishes), 506.3 (the controller is accountable for acknowledging it).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const DARIUS_TRIFARIAN = "ogn-027-298";

/** Inline [1] action spell: deal 1 to a unit — a cheap "card played this turn". */
const sting = (name: string) => ({
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name,
  timing: "action",
});

/** P1's turn with plenty of resources; Darius already on the board and EXHAUSTED, plus three cheap spells to play. */
function onBoard() {
  return scenario()
    .resources(P1, { energy: 9, power: { fury: 1 } })
    .unit(P1, "base", DARIUS_TRIFARIAN, "darius", { exhausted: true })
    .unit(P1, "base", { might: 4, name: "Dummy" }, "dummy")
    .hand(P1, sting("Sting One"), "s1")
    .hand(P1, sting("Sting Two"), "s2")
    .hand(P1, sting("Sting Three"), "s3");
}

describe("Ruling 7cdbd3759d70e5b3 — Darius's ability is a mandatory triggered ability that fires on exactly the second card each turn", () => {
  test("the FIRST card of the turn does nothing: no Chain item, Darius still exhausted at 5 [Might]", async () => {
    const game = await onBoard().build();
    await game.p1.cast("s1", { targets: "dummy" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["s1"]); // only the spell itself
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
  });

  test("'played' means RESOLVED: casting the second card puts only the spell on the Chain — the Darius trigger appears once that spell has resolved", async () => {
    const game = await onBoard().build();
    await game.p1.cast("s1", { targets: "dummy" });
    await game.settle();
    await game.p1.cast("s2", { targets: "dummy" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["s2"]); // not yet — the card is not "played" until it resolves
    await game.p1.passPriority();
    await game.p2.passPriority(); // s2 resolves ⇒ the second card of the turn has been played
    expect(game.chain().map((c) => c.cardId)).toEqual(["darius"]);
    expect(game.chain()[0]).toMatchObject({ controller: P1, triggered: true });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // mandatory: nothing was asked of P1
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isExhausted: false, might: 7 });
  });

  test("it is once per turn: the THIRD card of the turn puts no further Darius item on the Chain and he stays at 7", async () => {
    const game = await onBoard().build();
    await game.p1.cast("s1", { targets: "dummy" });
    await game.settle();
    await game.p1.cast("s2", { targets: "dummy" });
    await game.settle();
    expect(game.state("darius").might).toBe(7);
    await game.p1.cast("s3", { targets: "dummy" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["s3"]); // no second Darius trigger
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(3);
    expect(game.state("darius").might).toBe(7); // not 9
    expect(game.violations()).toEqual([]);
  });

  test("Darius counts himself: played as the second card of the turn he sees his own play and triggers on it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 1 } })
      .unit(P1, "base", { might: 4, name: "Dummy" }, "dummy")
      .hand(P1, sting("Sting One"), "s1")
      .hand(P1, DARIUS_TRIFARIAN, "darius")
      .build();
    await game.p1.cast("s1", { targets: "dummy" });
    await game.settle();
    await game.p1.play("darius", { to: "base" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["darius"]); // his own trigger, put on the chain unasked (a unit is played on arrival)
    expect(game.chain()[0]?.triggered).toBe(true);
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isExhausted: false, might: 7 });
    expect(game.violations()).toEqual([]);
  });
});
