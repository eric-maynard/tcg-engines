/**
 * Ruling 52482b31ebc773a2 — Altar to Unity (ogn-275-298) · Battlefield
 *   "When you hold here, play a 1 [Might] Recruit unit token in your base."
 *   × Trifarian Gloryseeker (ogn-217-298) · Unit · [2] · 2 Might — "[Legion] — When you play me, buff me."
 *
 * Q: Does playing a token with Altar to Unity count for [Legion]?
 * A: No. Tokens are not cards, and [Legion] asks whether you have played a CARD this turn. The Recruit
 *    the Altar puts out leaves [Legion] unsatisfied.
 * Rules: 186 (tokens are not cards), 810.1 ([Legion]: "if you've played another card this turn"),
 *        470 (Hold scoring at the start of your turn), 419.4 (playing a card).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ALTAR_TO_UNITY = "ogn-275-298";
const GLORYSEEKER = "ogn-217-298";

/** Costs [1] — a real CARD, for the contrast case. */
const CANTRIP = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Test Cantrip",
  rulesText: "Draw 1.",
} as const;

/** P2's turn is about to end; P1 holds the Altar with a Warden and has runes to spend next turn. */
function board() {
  return scenario()
    .active(P2)
    .runes(P1, "fury", 3)
    .battlefield("bf1", { controller: P1, def: ALTAR_TO_UNITY, inert: false })
    .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
    .hand(P1, GLORYSEEKER, "seeker")
    .hand(P1, CANTRIP, "cantrip");
}

describe("Ruling 52482b31ebc773a2 — an Altar to Unity token does not switch [Legion] on", () => {
  test("holding the Altar plays a Recruit TOKEN into the base at the start of P1's turn", async () => {
    const game = await board().build();
    await game.advanceTurn(); // P2 ends → P1's Beginning Phase: Hold scoring
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    const recruit = game.p1.base().find((id) => game.state(id).name === "Recruit");
    expect(recruit).toBeDefined();
    expect(game.state(recruit!)).toMatchObject({ isToken: true, might: 1 });
  });

  test("[Legion] is still OFF afterwards: the Gloryseeker played as the first CARD of the turn gets no buff", async () => {
    const game = await board().build();
    await game.advanceTurn();
    await game.p1.tapRunes(2);
    await game.p1.play("seeker");
    await game.settle();
    expect(game.zoneOf("seeker")).toBe("base");
    expect(game.state("seeker")).toMatchObject({ isBuffed: false, might: 2 });
  });

  test("contrast — a real CARD played first does switch [Legion] on: the Gloryseeker is buffed", async () => {
    const game = await board().build();
    await game.advanceTurn();
    await game.p1.tapRunes(3);
    await game.p1.cast("cantrip");
    await game.settle();
    await game.p1.play("seeker");
    await game.settle();
    expect(game.state("seeker")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("the token is a token all the way: it never enters the hand or trash accounting as a card", async () => {
    const game = await board().build();
    await game.advanceTurn();
    const recruit = game.p1.base().find((id) => game.state(id).name === "Recruit")!;
    expect(game.state(recruit).isToken).toBe(true);
    expect(game.p1.hand()).not.toContain(recruit);
    expect(game.p1.trash()).not.toContain(recruit);
    expect(game.violations()).toEqual([]);
  });
});
