/**
 * Ruling 49ec0a1c2f80c0df — Darius, Trifarian (ogn-027-298) · Unit/Champion · Fury · [5][fury] · 5 Might
 *   "When you play your second card in a turn, give me +2 [Might] this turn and ready me."
 *
 * Q: When Darius IS the second card played, does he ready himself, or does he need to see a further card?
 * A: He counts himself. A card is "played" once it has resolved and entered the board, so Darius is
 *    already in play when the trigger condition is checked — he sees himself as the second card, takes
 *    +2 [Might] and readies. (Units enter exhausted, so the ready is what matters.)
 * Rules: 419.4 (a card is played when it finishes resolving), 383.1 (the permanent must be on board for
 *        its trigger), 402.1.c (readying an already-ready object does nothing).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const DARIUS = "ogn-027-298";

/** Costs [1] — a cheap card to burn the "first card of the turn" slot. */
const CANTRIP = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Test Cantrip",
  rulesText: "Draw 1.",
} as const;

describe("Ruling 49ec0a1c2f80c0df — Darius counts himself as the second card", () => {
  test("first a cantrip, then Darius: his own play IS the second card — he readies and is 7 Might this turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 1 } })
      .hand(P1, CANTRIP, "cantrip")
      .hand(P1, DARIUS, "darius")
      .build();
    await game.p1.cast("cantrip");
    await game.settle();
    await game.p1.play("darius");
    await game.settle();
    expect(game.zoneOf("darius")).toBe("base");
    expect(game.state("darius")).toMatchObject({ isExhausted: false, isReady: true, might: 7 });
  });

  test("as the FIRST card of the turn nothing happens — he enters exhausted at 5 Might", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { fury: 1 } })
      .hand(P1, DARIUS, "darius")
      .build();
    await game.p1.play("darius");
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isExhausted: true, isReady: false, might: 5 });
  });

  test("…and then the NEXT card played that turn triggers him from the board", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 1 } })
      .hand(P1, DARIUS, "darius")
      .hand(P1, CANTRIP, "cantrip")
      .build();
    await game.p1.play("darius");
    await game.settle();
    expect(game.state("darius").isExhausted).toBe(true);
    await game.p1.cast("cantrip");
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isExhausted: false, might: 7 });
  });

  test("the +2 is 'this turn' — it lapses in the Expiration Step, and the ready persists", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 1 } })
      .hand(P1, CANTRIP, "cantrip")
      .hand(P1, DARIUS, "darius")
      .build();
    await game.p1.cast("cantrip");
    await game.settle();
    await game.p1.play("darius");
    await game.settle();
    expect(game.state("darius").might).toBe(7);
    await game.advanceTurn();
    expect(game.state("darius")).toMatchObject({ isExhausted: false, might: 5 });
    expect(game.violations()).toEqual([]);
  });
});
