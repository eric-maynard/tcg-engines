/**
 * Progress Day — ogn-114-298 · Spell · Mind · 6 energy + [mind]
 *
 *   Draw 4.
 *
 * No [Action]/[Reaction]: rule 155 — playable only in a Neutral Open State on your own turn
 * (rule 159.2.a.1: showdowns need [Action]).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-114-298";

describe("Progress Day (ogn-114-298)", () => {
  test("costs 6 energy + 1 mind; the spell resolves to trash and draws 4", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { mind: 1 } }).hand(P1, CARD, "pd").build();
    expect(game.p1.hand()).toEqual(["pd"]);
    const deckBefore = game.p1.deck();
    await game.p1.cast("pd");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("pd")).toBe("trash");
    expect(game.p1.hand()).toEqual(deckBefore.slice(0, 4)); // the top four, in order
    expect(game.p1.deck()).toHaveLength(deckBefore.length - 4);
  });

  test("unaffordable with 5 energy, or without the mind power", async () => {
    const lowEnergy = await scenario().resources(P1, { energy: 5, power: { mind: 1 } }).hand(P1, CARD, "pd").build();
    expect(lowEnergy.p1.can("cast", "pd")).toBe(false);
    const noPower = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "pd").build();
    expect(noPower.p1.can("cast", "pd")).toBe(false);
  });

  test("with only 2 cards left: draw 2, Burn Out (trash recycled, opponent +1 point), then draw the other 2 (rules 413.4 / 431.2)", async () => {
    const filler = "ogn-175-298";
    const game = await scenario()
      .fillDecks(false)
      .deck(P1, [filler, filler], ["c1", "c2"])
      .trash(P1, filler, "t1")
      .trash(P1, filler, "t2")
      .trash(P1, filler, "t3")
      .resources(P1, { energy: 6, power: { mind: 1 } })
      .hand(P1, CARD, "pd")
      .build();
    await game.p1.cast("pd");
    await game.settle({ policy: "first" });
    const hand = game.p1.hand();
    expect(hand).toHaveLength(4);
    expect(hand).toEqual(expect.arrayContaining(["c1", "c2"]));
    expect(hand.filter((c) => ["t1", "t2", "t3"].includes(c))).toHaveLength(2);
    expect(game.p1.deck()).toHaveLength(1);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.trash()).toEqual(["pd"]);
  });

  test("not castable on the opponent's turn", async () => {
    const game = await scenario().active(P2).resources(P1, { energy: 6, power: { mind: 1 } }).hand(P1, CARD, "pd").build();
    expect(game.p1.can("cast", "pd")).toBe(false);
  });

  test("without [Action] it is not castable during a showdown (rules 155 / 159.2.a.1)", async () => {
    // Expected: with a showdown open the plain-timed spell is off the menu even for the focus holder.
    // Actual: the card data/engine only distinguish action|reaction timing, so it is offered in showdowns.
    const game = await scenario()
      .resources(P1, { energy: 6, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3 }, "foe")
      .unit(P1, "base", { might: 3 }, "attacker")
      .hand(P1, CARD, "pd")
      .build();
    await game.p1.move("attacker", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "pd")).toBe(false);
  });
});
