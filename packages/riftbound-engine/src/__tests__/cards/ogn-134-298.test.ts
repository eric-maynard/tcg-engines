/**
 * Mobilize — ogn-134-298 · Spell · Body · 2 energy · (no printed [Action]/[Reaction] → standard timing)
 *
 *   Channel 1 rune exhausted. If you can't, draw 1.
 *
 * Rule 430: Channel = top rune of the Rune Deck onto the board; "exhausted" means it enters
 * exhausted (430.2). "If you can't" = the Rune Deck is empty (430.3), then draw 1 instead
 * (cf. 430.5's own example).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-134-298";

describe("Mobilize (ogn-134-298)", () => {
  test("costs 2 energy: channels the top rune of the Rune Deck exhausted, draws nothing, goes to trash", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "mob").build();
    const handBefore = game.p1.hand().length; // includes mob
    const runesBefore = game.p1.runes().length;
    const runeDeckBefore = game.p1.runeDeck().length;
    await game.p1.cast("mob");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("mob")).toBe("chain");
    await game.settle();
    expect(game.zoneOf("mob")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.p1.runeDeck()).toHaveLength(runeDeckBefore - 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1); // it entered exhausted
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.p1.hand()).toHaveLength(handBefore - 1); // no draw when the channel succeeded
  });

  test("not affordable with 1 energy", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "mob").build();
    expect(game.p1.can("cast", "mob")).toBe(false);
    const r = await game.p1.try((p) => p.cast("mob"));
    expect(r.ok).toBe(false);
  });

  test.failing("BUG: 'If you can't, draw 1' — with an empty Rune Deck the caster draws a card instead", async () => {
    // Expected: no rune to channel → draw 1 (hand goes from 1 (mob) to 1 after mob leaves and a card is drawn).
    // Actual: the parsed ability only carries the channel clause; nothing is drawn.
    const game = await scenario().fillDecks({ main: 10, runes: 0 }).resources(P1, { energy: 2 }).hand(P1, CARD, "mob").build();
    expect(game.p1.runeDeck()).toHaveLength(0);
    const deckBefore = game.p1.deck().length;
    await game.p1.cast("mob");
    await game.settle();
    expect(game.zoneOf("mob")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(deckBefore - 1);
  });

  test("no printed [Action] tag → standard timing: not castable during a showdown, even with Focus (rules 155, 159.2.a.1)", async () => {
    // rule 155: the timing class comes from the printed [Action]/[Reaction] keyword; Mobilize's
    // rules text has neither, so it is a standard-speed spell (the data file's `timing: "action"`
    // is the historic filler value that `normalizeSpellTiming` overrides).
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf1", { might: 5 }, "foe")
      .hand(P1, CARD, "mob")
      .build();
    await game.p1.move("ally", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "mob")).toBe(false);
  });

  test("not castable on the opponent's turn in an open state", async () => {
    const game = await scenario().active(P2).resources(P1, { energy: 2 }).hand(P1, CARD, "mob").build();
    expect(game.p1.can("cast", "mob")).toBe(false);
  });
});
