/**
 * Ruling 36b7dbb52c5bfd97 — Darius, Trifarian (OGN-027 → ogn-027-298) · Fury · [5][fury] · 5 Might
 *     "When you play your second card in a turn, give me +2 [Might] this turn and ready me."
 *
 * Q: How long do I have to remember that Darius needs to be readied after my second card?
 * A: Only until the trigger would have an observable impact — readying him is observable, so it must be
 *    acknowledged (put on the chain) before any further game action, otherwise the tournament missed-trigger
 *    rules treat it as forgotten. The engine has no "forget" state: the trigger is queued and finalized as
 *    part of that second play, before anybody may take another action.
 * Rules: 383.3 (a trigger goes on the chain when it triggers), Tournament Rules 506.3 / 506.4
 *        (observable impact / missed triggers — a floor rule that lives outside the engine).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const DARIUS_TRIFARIAN = "ogn-027-298";
const PAWN = { cardType: "unit", might: 1, energyCost: 1, name: "Pawn" } as const;

/** P1's main phase, Darius exhausted on the board, three cheap units waiting in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 8 })
    .unit(P1, "base", DARIUS_TRIFARIAN, "darius", { exhausted: true })
    .hand(P1, PAWN, "first")
    .hand(P1, PAWN, "second")
    .hand(P1, PAWN, "third");
}

/** Play card #1 and let everything settle — nothing has triggered yet. */
async function afterFirstCard(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("first");
  await game.settle();
  return game;
}

describe("Ruling 36b7dbb52c5bfd97 — Darius' trigger is queued with the second play, before any later action", () => {
  test("premise: after ONE card this turn, Darius is untouched and still exhausted", async () => {
    const game = await afterFirstCard();
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5, mightModifier: 0 });
    expect(game.chain()).toEqual([]);
  });

  test("ruling: the moment the SECOND card is played the trigger is already on the chain — no window to forget it", async () => {
    const game = await afterFirstCard();
    await game.p1.play("second");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", triggered: true, controller: P1 })]);
    expect(game.state("darius").isExhausted).toBe(true); // not applied yet — it is a chain item
  });

  test("…and when it resolves Darius is READY with +2 (the observable impact the ruling is about)", async () => {
    const game = await afterFirstCard();
    await game.p1.play("second");
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7, mightModifier: 2 });
    expect(game.violations()).toEqual([]);
  });

  test("it is the SECOND card only — a third play this turn does not trigger him again", async () => {
    const game = await afterFirstCard();
    await game.p1.play("second");
    await game.settle();
    await game.p1.play("third");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("darius")).toMatchObject({ might: 7, mightModifier: 2 });
  });

  test("the +2 lapses at end of turn and Darius stays ready", async () => {
    const game = await afterFirstCard();
    await game.p1.play("second");
    await game.settle();
    await game.advanceTurn();
    expect(game.state("darius")).toMatchObject({ might: 5, mightModifier: 0, isReady: true });
  });
});
