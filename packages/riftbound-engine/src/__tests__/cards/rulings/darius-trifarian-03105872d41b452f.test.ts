/**
 * Ruling 03105872d41b452f — Darius, Trifarian (OGN-027 → ogn-027-298) · Unit · Fury · [5][fury] · 5 Might
 *     "When you play your second card in a turn, give me +2 [Might] this turn and ready me."
 *
 * Q: Can Darius trigger if HE is the second card played this turn, or must he already be out first?
 * A: Yes — Darius counts himself. Played as your second card he is on the board when "you played your second card" is
 *    checked, so he triggers: +2 Might this turn and readied. Nuances: as the third/fourth card he does NOT trigger (the moment
 *    passed); playing a TOKEN doesn't count as a card; a Darius already out from a previous turn triggers on your second card.
 * Rules: 383.4.a / 419.4 (play triggers after the permanent is on the board), 106/154 (tokens are not cards played from hand),
 *        "cards played this turn" bookkeeping.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DARIUS = "ogn-027-298";
const SPRITE_CALL = "ogn-094-298"; // "[Hidden][Action] Play a ready 3 [Might] Sprite unit token with [Temporary]." — puts a TOKEN into play

const cheap = (name: string) => ({ cardType: "unit", energyCost: 1, might: 1, name }) as const;

/** P1's turn with plenty: three cheap units + Darius in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .hand(P1, cheap("A"), "a")
    .hand(P1, cheap("B"), "b")
    .hand(P1, cheap("C"), "c")
    .hand(P1, DARIUS, "darius");
}

describe("Ruling 03105872d41b452f — Darius counts himself: played as the SECOND card he triggers", () => {
  test("A first, then Darius as card #2: he enters (exhausted), his trigger goes on the chain, and it resolves for +2 (→ 7) and readies him", async () => {
    const game = await board().build();
    await game.p1.play("a");
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 1 });
    await game.p1.play("darius");
    expect(game.zoneOf("darius")).toBe("base");
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", controller: P1, triggered: true })]);
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 }); // not yet resolved
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7, mightModifier: 2 });
    expect(game.violations()).toEqual([]);
  });

  test("he need not be first: Darius as card #1 does nothing on entering; the NEXT card (A, card #2) triggers him", async () => {
    const game = await board().build();
    await game.p1.play("darius");
    expect(game.chain().filter((c) => c.triggered)).toEqual([]);
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
    await game.p1.play("a");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", triggered: true })]);
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 });
  });

  test("nuance — as the THIRD card he does not trigger (A, B, then Darius): no Darius item, still 5 and exhausted; a fourth card doesn't help either", async () => {
    const game = await board().build();
    await game.p1.play("a");
    await game.settle();
    await game.p1.play("b");
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2 });
    await game.p1.play("darius");
    expect(game.chain().filter((c) => c.triggered)).toEqual([]);
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
    await game.p1.play("c");
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
  });

  test("nuance — a TOKEN entering play is not a 'card played': Sprite Call (card #1) makes a Sprite token, then Darius is card #2 and triggers", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { fury: 1, mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
      .hand(P1, SPRITE_CALL, "call")
      .hand(P1, DARIUS, "darius")
      .build();
    await game.p1.cast("call");
    const r = await game.settle();
    if (r.reason === "unanswered" && game.decision()?.kind === "pick") {
      await game.p1.pick("base");
      await game.settle();
    }
    const sprites = game.p1.units().filter((u) => game.state(u).isToken);
    expect(sprites).toHaveLength(1); // the token is in play …
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 1 }); // … but only Sprite Call counted
    await game.p1.play("darius");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", triggered: true })]);
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 });
  });

  test("nuance — a Darius already on the board from an earlier turn triggers when you play your second card this turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", DARIUS, "darius", { exhausted: true })
      .hand(P1, cheap("A"), "a")
      .hand(P1, cheap("B"), "b")
      .build();
    await game.p1.play("a");
    await game.settle();
    expect(game.state("darius").might).toBe(5);
    await game.p1.play("b");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", triggered: true })]);
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 });
  });
});
