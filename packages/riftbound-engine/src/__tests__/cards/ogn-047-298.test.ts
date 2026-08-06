/**
 * Find Your Center — ogn-047-298 · Spell · Calm · 3 energy
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   If an opponent's score is within 3 points of the Victory Score, this costs [2] less.
 *   Draw 1 and channel 1 rune exhausted.
 *
 * Channel (rule 415): top rune of the Rune Deck → rune pool; "exhausted" means
 * it arrives exhausted. Victory Score is 8 here, so "within 3" = opponent ≥ 5.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-047-298";

describe("Find Your Center (ogn-047-298)", () => {
  test("costs 3 energy: draws 1 and channels 1 rune exhausted, then goes to trash", async () => {
    const game = await scenario().victoryScore(8).resources(P1, { energy: 3 }).hand(P1, CARD, "fyc").build();
    const handBefore = game.p1.hand().length; // includes fyc
    const runesBefore = game.p1.runes().length;
    const runeDeckBefore = game.p1.runeDeck().length;
    await game.p1.cast("fyc");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("fyc")).toBe("trash");
    expect(game.p1.hand().length).toBe(handBefore - 1 + 1);
    expect(game.p1.runes().length).toBe(runesBefore + 1);
    expect(game.p1.runeDeck().length).toBe(runeDeckBefore - 1);
    // The channeled rune is exhausted; no ready rune was added.
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
  });

  test("not affordable with 2 energy when no opponent is near the Victory Score", async () => {
    const game = await scenario().victoryScore(8).points(P2, 4).resources(P1, { energy: 2 }).hand(P1, CARD, "fyc").build();
    expect(game.p1.can("cast", "fyc")).toBe(false);
    const r = await game.p1.try((p) => p.cast("fyc"));
    expect(r.ok).toBe(false);
  });

  test("costs [2] less (i.e. 1 energy) while an opponent is within 3 points of the Victory Score", async () => {
    // Expected: victory score 8, P2 on 5 → 8-5 = 3 → cost 1; castable with 1 energy and leaves 0.
    // Actual: the parsed ability carries only draw+channel; the conditional cost reduction is
    // dropped, so the spell still demands 3 energy.
    const game = await scenario().victoryScore(8).points(P2, 5).resources(P1, { energy: 1 }).hand(P1, CARD, "fyc").build();
    expect(game.p1.can("cast", "fyc")).toBe(true);
    await game.p1.cast("fyc");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("fyc")).toBe("trash");
  });

  test("with 3 energy and an opponent at 7/8, casting deducts only 1 energy (cost reduction not applied)", async () => {
    // Expected: reduction applies → 2 energy left. Actual: full 3 is charged → 0 left.
    const game = await scenario().victoryScore(8).points(P2, 7).resources(P1, { energy: 3 }).hand(P1, CARD, "fyc").build();
    await game.p1.cast("fyc");
    expect(game.p1.energy()).toBe(2);
  });

  test("only an OPPONENT's score counts: your own 7/8 does not reduce the cost", async () => {
    const game = await scenario().victoryScore(8).points(P1, 7).points(P2, 0).resources(P1, { energy: 3 }).hand(P1, CARD, "fyc").build();
    await game.p1.cast("fyc");
    expect(game.p1.energy()).toBe(0);
    const cheap = await scenario().victoryScore(8).points(P1, 7).resources(P1, { energy: 1 }).hand(P1, CARD, "fyc").build();
    expect(cheap.p1.can("cast", "fyc")).toBe(false);
  });

  test("[Action] timing: castable with Focus during a showdown; not on the opponent's turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf1", { might: 5 }, "foe")
      .hand(P1, CARD, "fyc")
      .build();
    await game.p1.move("ally", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "fyc")).toBe(true);
    const oppTurn = await scenario().active(P2).resources(P1, { energy: 3 }).hand(P1, CARD, "fyc").build();
    expect(oppTurn.p1.can("cast", "fyc")).toBe(false);
  });
});
