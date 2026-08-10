/**
 * Ruling 530784f5777d6c6c — Mobilize (OGN-134 → ogn-134-298) · [2] "Channel 1 rune exhausted. If you can't, draw 1."
 *   × Catalyst of Aeons (OGN-138 → ogn-138-298) · [4] "Channel 2 runes exhausted. If you couldn't channel 2 runes this way, draw 1."
 *
 * Q: With 12 runes already channeled at the start of my turn, do I skip my draw?
 * A: No. You still draw your card in the Beginning/Draw step; only the CHANNEL is capped (no 13th rune). The "if you can't
 *    channel, draw" wording belongs to Mobilize / Catalyst of Aeons, not to the turn structure.
 * Rules: 315.3 / 430.4.a (Channel Phase: channel 2), 430.3 (rune deck exhausted → channel as many as possible — the 12-card
 *        rune deck is what caps you at 12), 315.4 (Draw Phase: draw 1 regardless).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MOBILIZE = "ogn-134-298";
const CATALYST_OF_AEONS = "ogn-138-298";
const BODY_RUNE = { cardType: "rune", domain: "body", name: "Body Rune" } as const;

/** A 12-card rune deck of which `channeled` are already on the board (the rest still in the rune deck); main decks auto-filled. */
function runeState(channeled: number) {
  return scenario()
    .fillDecks({ main: 10, runes: 0 })
    .runes(P1, "body", channeled)
    .runeDeck(P1, Array.from({ length: 12 - channeled }, () => BODY_RUNE));
}

/** End of P2's turn 5. P1 already has all 12 runes channeled (rune deck empty). */
function board() {
  return runeState(12).turn(5).active(P2);
}

describe("Ruling 530784f5777d6c6c — 12 runes channeled: you still draw at the start of your turn; you just don't channel more", () => {
  test("P1's turn begins with 12 runes: after the Beginning Phase P1 has drawn exactly 1 card and still has exactly 12 runes (none added)", async () => {
    const game = await board().build();
    expect(game.p1.runes()).toHaveLength(12);
    expect(game.p1.runeDeck()).toEqual([]);
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(hand0 + 1); // the normal draw happened
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    expect(game.p1.runes()).toHaveLength(12); // capped: nothing channeled
    expect(game.violations()).toEqual([]);
  });

  test("control: with 10 runes the same turn start channels 2 (→ 12) AND draws 1 — drawing never depended on channeling", async () => {
    const game = await runeState(10).turn(5).active(P2).build();
    const hand0 = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.p1.runes()).toHaveLength(12);
    expect(game.p1.runeDeck()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test("where the 'if you can't, draw' idea comes from: Mobilize at 12 runes can't channel, so IT draws 1 instead", async () => {
    const game = await runeState(12).resources(P1, { energy: 2 }).hand(P1, MOBILIZE, "mobilize").build();
    const hand0 = game.p1.hand().length;
    await game.p1.cast("mobilize");
    await game.settle();
    expect(game.zoneOf("mobilize")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(12);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
  });

  test("…and Catalyst of Aeons at 11 runes channels only 1 (→ 12), 'couldn't channel 2', so it draws 1", async () => {
    const game = await runeState(11).resources(P1, { energy: 4 }).hand(P1, CATALYST_OF_AEONS, "catalyst").build();
    const hand0 = game.p1.hand().length;
    await game.p1.cast("catalyst");
    await game.settle();
    expect(game.zoneOf("catalyst")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(12);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
  });
});
