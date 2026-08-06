/**
 * Catalyst of Aeons — ogn-138-298 · Spell · Body · 4 energy
 *
 *   Channel 2 runes exhausted. If you couldn't channel 2 runes this way, draw 1.
 *
 * Rules: 430 (Channel: top rune(s) of the Rune Deck → board; 430.2 "exhausted"
 * means they enter exhausted; 430.3 channel as many as possible when the Rune
 * Deck runs short).
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ogn-138-298";

describe("Catalyst of Aeons (ogn-138-298)", () => {
  test("costs 4 energy: channels the top 2 runes of your rune deck exhausted, no draw, spell to trash", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "coa").build();
    const runeDeckBefore = game.p1.runeDeck().length;
    const handBefore = game.p1.hand().length; // includes coa
    await game.p1.cast("coa");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("coa")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.p1.runes({ ready: false })).toHaveLength(2);
    expect(game.p1.runeDeck().length).toBe(runeDeckBefore - 2);
    // Channeled 2 → no draw.
    expect(game.p1.hand().length).toBe(handBefore - 1);
    // Channeling exhausted runes adds no energy by itself.
    expect(game.p1.energy()).toBe(0);
  });

  test("not castable with only 3 energy", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "coa").build();
    expect(game.p1.can("cast", "coa")).toBe(false);
    const r = await game.p1.try((p) => p.cast("coa"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("coa")).toBe("hand");
  });

  test.failing("BUG: with only 1 rune left in the rune deck it channels that 1 exhausted and you draw 1 (430.3 + 'if you couldn't')", async () => {
    // Expected: 1 rune channeled exhausted, rune deck empty, and the fallback draw fires (+1 card).
    // Actual: the parsed ability is a bare `channel 2 exhausted`; the conditional draw is dropped.
    const game = await scenario().fillDecks({ main: 10, runes: 1 }).resources(P1, { energy: 4 }).hand(P1, CARD, "coa").build();
    expect(game.p1.runeDeck()).toHaveLength(1);
    const handBefore = game.p1.hand().length;
    await game.p1.cast("coa");
    await game.settle();
    expect(game.p1.runeDeck()).toHaveLength(0);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.hand().length).toBe(handBefore - 1 + 1);
  });

  test.failing("BUG: with an empty rune deck nothing is channeled and you draw 1", async () => {
    // Expected: 0 channeled → "couldn't channel 2" → draw 1. Actual: no draw happens.
    const game = await scenario().fillDecks({ main: 10, runes: 0 }).resources(P1, { energy: 4 }).hand(P1, CARD, "coa").build();
    expect(game.p1.runeDeck()).toHaveLength(0);
    const handBefore = game.p1.hand().length;
    await game.p1.cast("coa");
    await game.settle();
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p1.hand().length).toBe(handBefore - 1 + 1);
    expect(game.zoneOf("coa")).toBe("trash");
  });
});
