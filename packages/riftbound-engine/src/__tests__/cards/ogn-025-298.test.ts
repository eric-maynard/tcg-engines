/**
 * Blind Fury — ogn-025-298 · Spell · Fury · 4 energy + [fury][fury]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Each opponent reveals the top card of their Main Deck. Choose one and
 *   banish it, then play it, ignoring its cost. Then recycle the rest.
 *
 * Rule 356.1.b.1 — "ignoring its cost" sets base energy and power cost to 0.
 * Rule 806 — Action: playable in Neutral Open on your turn and during showdowns.
 * The spell chooses nothing at play time (the choice is among revealed cards on
 * resolution), so it needs no board target to be cast.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, P3, scenario } from "../../harness";

const CARD = "ogn-025-298";
const SKULKER = "ogn-175-298"; // vanilla 3-might unit

describe("Blind Fury (ogn-025-298)", () => {
  test("castable with no permanents on the board (it targets nothing at play time); costs 4 energy + 2 fury", async () => {
    // Expected: legal with 4 energy + FF and an opponent deck; paying leaves the pool empty.
    // Actual: the engine treats the "banish" step as a caster-chosen board target, so with an
    // empty board the spell is not offered at all.
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 2 } })
      .deckTop(P2, SKULKER, "top")
      .hand(P1, CARD, "bf")
      .build();
    expect(game.p1.can("cast", "bf")).toBe(true);
    expect(game.p1.option("cast", "bf")?.fields.some((f) => f.arg === "targets" && f.required)).toBe(false);
    await game.p1.cast("bf");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("bf")).toBe("chain");
  });

  test("not playable with 4 energy but only one fury power", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 1 } })
      .unit(P2, "base", { might: 2 }, "bystander")
      .deckTop(P2, SKULKER, "top")
      .hand(P1, CARD, "bf")
      .build();
    expect(game.p1.can("cast", "bf")).toBe(false);
  });

  test.failing("BUG: the opponent's top card is banished then played by the caster for free (unit lands under P1's control)", async () => {
    // Expected: P2's top card leaves the deck, is banished, then P1 plays it ignoring cost.
    // Actual: not castable without a board target, and even when cast the top card never moves.
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 2 } })
      .deckTop(P2, SKULKER, "top")
      .hand(P1, CARD, "bf")
      .build();
    const p2DeckBefore = game.p2.deck().length;
    await game.p1.cast("bf");
    await game.settle({ policy: "first" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("top")).toBe("base");
    expect(game.state("top").controller).toBe(P1);
    expect(game.p1.units("base")).toContain("top");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // played for free
    expect(game.p2.deck()).toHaveLength(p2DeckBefore - 1);
    expect(game.zoneOf("bf")).toBe("trash");
  });

  test("[Action]: castable during a showdown while the caster has focus", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1 }, "foe")
      .unit(P1, "base", { might: 3 }, "attacker")
      .deckTop(P2, SKULKER, "top")
      .hand(P1, CARD, "bf")
      .build();
    await game.p1.move("attacker", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "bf")).toBe(true);
  });

  test("[Action]: not castable on an opponent's turn in a Neutral Open state", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 4, power: { fury: 2 } })
      .unit(P2, "base", { might: 2 }, "bystander")
      .deckTop(P2, SKULKER, "top")
      .hand(P1, CARD, "bf")
      .build();
    expect(game.p1.can("cast", "bf")).toBe(false);
  });

  test("with two opponents the unchosen revealed card is recycled to the bottom of its owner's deck", async () => {
    // Expected: P1 picks P2's card (played under P1), P3's revealed card goes to the bottom of P3's deck.
    // Actual: see above — the reveal/banish/play/recycle sequence never runs.
    const game = await scenario({ players: 3 })
      .resources(P1, { energy: 4, power: { fury: 2 } })
      .deckTop(P2, SKULKER, "top2")
      .deckTop(P3, SKULKER, "top3")
      .hand(P1, CARD, "bf")
      .script(P1, ["top2"])
      .build();
    await game.p1.cast("bf");
    await game.settle({ policy: "first" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("top2")).toBe("base");
    expect(game.state("top2").controller).toBe(P1);
    const p3Deck = game.seat(P3).deck();
    expect(p3Deck[p3Deck.length - 1]).toBe("top3");
  });
});
