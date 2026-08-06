/**
 * Stacked Deck — ogn-183-298 · Spell · Chaos · 1 energy (no power)
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Look at the top 3 cards of your Main Deck. Put 1 into your hand and recycle the rest.
 *
 * "Recycle" = put on the bottom of the Main Deck. The pick is mandatory (exactly 1) and is not
 * restricted by card type.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, PickDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-183-298";
const SKULKER = "ogn-175-298"; // vanilla unit
const HEXTECH_RAY = "ogn-009-298"; // a spell

function board(energy = 1) {
  return scenario()
    .resources(P1, { energy })
    .deck(P1, [SKULKER, HEXTECH_RAY, SKULKER, SKULKER, SKULKER], ["c1", "c2", "c3", "fourth", "fifth"])
    .hand(P1, CARD, "sd");
}

describe("Stacked Deck (ogn-183-298)", () => {
  test("costs 1 energy; unaffordable with 0", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "sd")).toBe(true);
    await game.p1.cast("sd");
    expect(game.p1.energy()).toBe(0);
    const poor = await board(0).build();
    expect(poor.p1.can("cast", "sd")).toBe(false);
  });

  test("looks at exactly the top 3 (any card type) and asks the caster to put exactly 1 into hand", async () => {
    const game = await board().build();
    await game.p1.cast("sd");
    await game.settle();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["c1", "c2", "c3"]);
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    expect(d.allowDecline).toBe(false);
  });

  test("the picked card goes to hand; the other two are recycled to the bottom; the 4th card is now on top", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("sd");
    await game.settle();
    await game.p1.pick("c2");
    await game.settle();
    expect(game.zoneOf("c2")).toBe("hand");
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1);
    const deck = game.p1.deck();
    expect(deck[0]).toBe("fourth");
    expect(deck[1]).toBe("fifth");
    expect(deck.slice(-2).sort()).toEqual(["c1", "c3"]);
    expect(game.zoneOf("sd")).toBe("trash");
  });

  test("[Action]: castable during a showdown while you have focus", async () => {
    const game = await board()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1 }, "foe")
      .unit(P1, "base", { might: 3 }, "attacker")
      .build();
    await game.p1.move("attacker", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "sd")).toBe(true);
  });

  test("[Action]: not castable on the opponent's turn outside a showdown", async () => {
    const game = await board().active(P2).build();
    expect(game.p1.can("cast", "sd")).toBe(false);
  });
});
