/**
 * Premonition — sfd-087-221 · Spell · Mind · 2 energy + [mind][mind][mind]
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Draw 3.
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. Cost is 2 energy AND three MIND power — two mind is short, off-domain power does not pay a
 *      [mind] pip, but a floating [rainbow] (any-domain power) does.
 *   2. [Reaction] (813): playable in Closed states on ANY player's turn once you hold priority — in
 *      response to the opponent's spell (resolving first, LIFO) or with Focus in their showdown — but
 *      "any time" still needs priority: not in the opponent's Neutral Open state (512).
 *   3. Draw 3 with fewer than 3 cards left: draw what is there, Burn Out (trash → deck, an opponent
 *      gains 1 point), then finish the draw (413.4 / 431.2). The resolving Premonition is not yet in
 *      the trash when that recycle happens.
 *   4. Counter-play: Defy ("costs … no more than [rainbow]") can NOT counter it — 3 power pips.
 *   5. Draws come from the TOP of the Main Deck in order; the spell itself ends in trash, not hand.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-087-221";
const DEFY = "ogn-045-298"; // [Reaction] 1 + [calm]: Counter a spell that costs ≤ [4] and ≤ [rainbow].
const CLEAVE = "ogn-004-298"; // [Action] 1-energy fury spell — the opponent's chain opener
const FILLER = "ogn-175-298";
const FULL = { energy: 2, power: { mind: 3 } };

function ready() {
  return scenario().resources(P1, FULL).deck(P1, [FILLER, FILLER, FILLER, FILLER], ["d1", "d2", "d3", "d4"]).hand(P1, CARD, "prem");
}

describe("Premonition (sfd-087-221)", () => {
  test("registry payload: a [Reaction]-timed spell whose only effect is draw 3; printed cost 2 + [mind]×3", async () => {
    const game = await ready().build();
    expect(game.state("prem")).toMatchObject({ cardType: "spell", energyCost: 2, name: "Premonition" });
    expect(game.state("prem").powerCost).toEqual(["mind", "mind", "mind"]);
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def?.timing).toBe("reaction");
    expect(def?.abilities).toEqual([{ effect: { amount: 3, type: "draw" }, timing: "reaction", type: "spell" }]);
  });

  test("own turn: pays 2 energy + 3 mind, waits on the chain, then draws the top three cards in order; spell → trash", async () => {
    const game = await ready().build();
    await game.p1.cast("prem");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "prem", controller: P1, triggered: false })]);
    expect(game.p1.hand()).toEqual([]); // nothing drawn before resolution
    await game.settle();
    expect(game.p1.hand().sort()).toEqual(["d1", "d2", "d3"]);
    expect(game.p1.deck()[0]).toBe("d4");
    expect(game.zoneOf("prem")).toBe("trash");
    expect(game.p2.hand()).toEqual([]);
  });

  test("cost edge cases: two mind is short; off-domain power does not pay a [mind] pip; 1 energy is short; a floating [rainbow] covers the third pip", async () => {
    expect((await scenario().resources(P1, { energy: 2, power: { mind: 2 } }).hand(P1, CARD, "prem").build()).p1.can("cast", "prem")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2, power: { fury: 1, mind: 2 } }).hand(P1, CARD, "prem").build()).p1.can("cast", "prem")).toBe(false);
    expect((await scenario().resources(P1, { energy: 1, power: { mind: 3 } }).hand(P1, CARD, "prem").build()).p1.can("cast", "prem")).toBe(false);
    const rainbow = await scenario().resources(P1, { energy: 2, power: { mind: 2, rainbow: 1 } }).hand(P1, CARD, "prem").build();
    expect(rainbow.p1.can("cast", "prem")).toBe(true);
    await rainbow.p1.cast("prem");
    expect(rainbow.p1.energy()).toBe(0);
    expect(rainbow.p1.power()).toBe(0);
  });

  test("paying from runes: tap two Mind runes for energy and recycle three for power, then cast", async () => {
    const game = await scenario().runes(P1, "mind", 5).hand(P1, CARD, "prem").build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.p1.tapRunes(2);
    await game.p1.recycleRune({ domain: "mind" });
    await game.p1.recycleRune({ domain: "mind" });
    await game.p1.recycleRune({ domain: "mind" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 3 } });
    await game.p1.cast("prem");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.p1.runes()).toHaveLength(2); // the three recycled runes went back under the rune deck
  });

  test("[Reaction] on the opponent's turn: cast in response to their spell, it resolves FIRST — P1 holds 3 new cards while Cleave is still on the chain", async () => {
    const game = await ready()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P2, "base", { might: 2 }, "theirs")
      .hand(P2, CLEAVE, "cleave")
      .build();
    expect(game.p1.can("cast", "prem")).toBe(false); // Neutral Open on P2's turn: no priority for P1 (512)
    await game.p2.cast("cleave", { targets: "theirs" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "prem")).toBe(true);
    await game.p1.cast("prem");
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "prem"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand().sort()).toEqual(["d1", "d2", "d3"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.turnPlayer()).toBe(P2);
  });

  test("[Reaction] ⊇ [Action]: castable with Focus during the opponent's showdown; the defender then fights with three more cards in hand", async () => {
    const game = await ready()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "def")
      .unit(P2, "base", { might: 2 }, "atk")
      .build();
    await game.p2.move("atk", "bf1");
    expect(game.p1.can("cast", "prem")).toBe(false); // attacker holds Focus first
    await game.p2.passFocus();
    expect(game.p1.can("cast", "prem")).toBe(true);
    await game.p1.cast("prem");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.zoneOf("atk")).toBe("trash"); // 2 into 3: the attacker dies, P1 keeps bf1
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("responding to your OWN spell (Neutral Closed on your turn) is legal for a Reaction", async () => {
    const game = await ready().resources(P1, { energy: 3, power: { mind: 3 } }).unit(P2, "base", { might: 2 }, "theirs").hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "theirs" });
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("cast", "prem")).toBe(true);
    await game.p1.cast("prem");
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "prem"]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(3);
  });

  test("counter-play negative space: Defy cannot counter Premonition (three power pips > [rainbow]) and it resolves in full", async () => {
    const game = await ready().resources(P2, { energy: 1, power: { calm: 1 } }).hand(P2, DEFY, "defy").build();
    await game.p1.cast("prem");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "defy")).toBe(false);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.zoneOf("defy")).toBe("hand");
  });

  test("Draw 3 with only two cards left: draw 2, Burn Out (trash recycled into the deck, the opponent gains 1 point), then draw the third (413.4 / 431.2)", async () => {
    const game = await scenario()
      .fillDecks({ main: 0, runes: 12 })
      .resources(P1, FULL)
      .deck(P1, [FILLER, FILLER], ["d1", "d2"])
      .trash(P1, FILLER, "t1")
      .trash(P1, FILLER, "t2")
      .trash(P1, FILLER, "t3")
      .hand(P1, CARD, "prem")
      .build();
    expect(game.p2.points()).toBe(0);
    await game.p1.cast("prem");
    await game.settle();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick(P2); // "choose an opponent to gain 1 point" (forced in a duel, may be auto-taken)
      await game.settle();
    }
    const hand = game.p1.hand();
    expect(hand).toHaveLength(3);
    expect(hand).toEqual(expect.arrayContaining(["d1", "d2"]));
    expect(["t1", "t2", "t3"]).toContain(hand.find((c) => c !== "d1" && c !== "d2")!);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.deck()).toHaveLength(2); // 3 recycled − 1 drawn
    expect(game.p1.trash()).toEqual(["prem"]); // only the resolved spell — it was not part of the recycle
    expect(game.isOver()).toBe(false);
  });

  test("no lingering effect: next turn P1 draws only the normal draw-phase card", async () => {
    const game = await ready().active(P2).resources(P2, { energy: 1 }).unit(P2, "base", { might: 2 }, "theirs").hand(P2, CLEAVE, "cleave").build();
    await game.p2.cast("cleave", { targets: "theirs" });
    await game.p2.passPriority();
    await game.p1.cast("prem");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(3);
    await game.advanceTurn(); // → P1's turn: +1 from the Draw Phase only
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.hand()).toHaveLength(4);
  });

  test.failing("BUG: 'any time' still needs priority (312.1 / 312.2.c–d) — right after P2's Cleave is finalized P2 holds priority, so P1 may not cast yet", async () => {
    // Expected: with Cleave just added and P2 not yet passed, P1 has no priority-class option; only after
    // P2 passes does Premonition become legal. Actual: the engine offers (and accepts) P1's Reaction
    // immediately, and the harness records a singleDecisionCursor violation.
    const game = await ready().active(P2).resources(P2, { energy: 1 }).unit(P2, "base", { might: 2 }, "theirs").hand(P2, CLEAVE, "cleave").build();
    await game.p2.cast("cleave", { targets: "theirs" });
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("cast", "prem")).toBe(false);
    expect(game.violations()).toEqual([]);
    await game.p2.passPriority();
    expect(game.p1.can("cast", "prem")).toBe(true);
  });
});
