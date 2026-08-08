/**
 * The Papertree — sfd-219-221 · Battlefield
 *
 *   When you hold here, each player channels 1 rune exhausted.
 *
 * Rules: 469.2 / 315.2.b (Hold: the turn player keeps a battlefield through their own Beginning Phase,
 * +1 point), 383.4.d / 471.2.b (a Hold Effect: a triggered ability on the chain, controlled by whoever
 * held — a battlefield belongs to no deck side), 315.2 → 315.3 (the Beginning Phase, and its chain,
 * finish BEFORE the Channel Phase channels the turn player's 2 ready runes), 430 (Channel = top rune of
 * the Rune Deck onto the board; 430.2 "exhausted" overrides the ready default; 430.3 an empty deck
 * channels as many as possible — zero — without failing anything), 315.1 (Awaken readies YOUR runes at
 * the start of YOUR turn only), "each player" = the holder and every opponent alike.
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Symmetric effect, asymmetric tempo: both players get a rune, but exhausted — the holder cannot
 *     tap it this turn (2 energy available, not 3); the opponent's readies at THEIR next Awaken (so they
 *     start that turn with 3 ready), while the holder's extra rune is still exhausted during that turn.
 *  2. Ordering: it resolves inside the Beginning Phase, so with only 2 runes left in the holder's deck
 *     the Papertree takes the first one exhausted and the Channel Phase finds just one more.
 *  3. Empty rune deck on either side: that player simply channels nothing; the other still does.
 *  4. "You" = the holder: P2 holding a Papertree from P1's deck triggers it (item controlled by P2),
 *     and P1 — now "each player" — receives an exhausted rune on P2's turn.
 *  5. Negative space: no trigger in the opponent's Beginning Phase, none on conquer, and holding a
 *     second plain battlefield must not fire it again (053.3 "here").
 *  6. Partner: Blue Sentinel here doubles the hold effect → each player channels 2 exhausted.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-219-221";
const FURY_RUNE = "ogn-007-298";
const BLUE_SENTINEL = "unl-087-219"; // your hold effects for holding here trigger an additional time

/** P2 is about to end turn 2; P1 controls the Papertree (bf1) with a unit on it. 12-rune decks each. */
function aboutToHold() {
  return scenario().turn(2).active(P2).battlefield("bf1", { controller: P1, def: CARD, inert: false }).unit(P1, "bf1", { might: 2, name: "Sentry" }, "sentry");
}

describe("The Papertree (sfd-219-221)", () => {
  test("hold → one triggered item controlled by P1 waits in the Beginning Phase; P2 gets priority; on resolution EACH player channels 1 exhausted, then P1's Channel Phase adds 2 ready", async () => {
    const game = await aboutToHold().build();
    expect(game.p1.runeDeck()).toHaveLength(12);
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", controller: P1, name: "The Papertree", triggered: true })]);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.runes()).toHaveLength(0); // nothing channels before it resolves
    expect(game.p2.runes()).toHaveLength(0);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.p2.runes()).toHaveLength(1);
    expect(game.p2.runes({ ready: true })).toHaveLength(0);
    expect(game.p1.runeDeck()).toHaveLength(9);
    expect(game.p2.runeDeck()).toHaveLength(11);
    expect(game.violations()).toEqual([]);
  });

  test("the holder's extra rune is exhausted: only 2 energy can be tapped this turn, the third tap is illegal", async () => {
    const game = await aboutToHold().build();
    await game.advanceTurn();
    await game.p1.tapRunes(2);
    expect(game.p1.energy()).toBe(2);
    expect((await game.p1.try((p) => p.tapRune())).ok).toBe(false);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
  });

  test("tempo across turns: the opponent's exhausted rune readies at THEIR Awaken (3 ready on their turn) while the holder's stays exhausted until the holder's own next turn", async () => {
    const game = await aboutToHold().build();
    await game.advanceTurn(); // P1 holds
    expect(game.p2.runes({ ready: true })).toHaveLength(0);
    await game.advanceTurn(); // P2's turn: awaken readies P2's rune, channel 2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.runes()).toHaveLength(3);
    expect(game.p2.runes({ ready: true })).toHaveLength(3);
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.runes({ ready: true })).toHaveLength(2); // P1's Papertree rune is still exhausted on P2's turn
    await game.advanceTurn(); // P1 again: awaken readies all 3, holds again (+1 exhausted), channels 2
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.p1.runes()).toHaveLength(6);
    expect(game.p1.runes({ ready: true })).toHaveLength(5);
    expect(game.p2.runes()).toHaveLength(4); // P2 got a second exhausted rune from the second hold
  });

  test("ordering (315.2 before 315.3): with exactly 2 runes left in the holder's deck, the Papertree takes one EXHAUSTED first and the Channel Phase finds only one more (ready)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .fillDecks({ main: 10, runes: 0 })
      .runeDeck(P1, [FURY_RUNE, FURY_RUNE])
      .runeDeck(P2, [FURY_RUNE, FURY_RUNE, FURY_RUNE])
      .battlefield("bf1", { controller: P1, def: CARD, inert: false })
      .unit(P1, "bf1", { might: 2, name: "Sentry" }, "sentry")
      .build();
    await game.advanceTurn();
    expect(game.phase()).toBe("main");
    expect(game.p1.runeDeck()).toHaveLength(0);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runes({ ready: true })).toHaveLength(1);
    expect(game.p2.runes()).toHaveLength(1);
    expect(game.p2.runeDeck()).toHaveLength(2);
  });

  test("430.3 — an EMPTY rune deck channels nothing and breaks nothing: P2 (empty) gets no rune, P1 still gets the exhausted one plus the 2 from the Channel Phase", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .fillDecks({ main: 10, runes: 0 })
      .runeDeck(P1, [FURY_RUNE, FURY_RUNE, FURY_RUNE, FURY_RUNE])
      .battlefield("bf1", { controller: P1, def: CARD, inert: false })
      .unit(P1, "bf1", { might: 2, name: "Sentry" }, "sentry")
      .build();
    expect(game.p2.runeDeck()).toHaveLength(0);
    await game.advanceTurn();
    expect(game.phase()).toBe("main");
    expect(game.p2.runes()).toHaveLength(0);
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.p1.points()).toBe(1);
  });

  test("'you' is the holder: P2 holding a Papertree from P1's deck puts a P2-controlled item on the chain, and P1 (as 'each player') receives an exhausted rune on P2's turn", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
      .build();
    await game.p1.endTurn();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", controller: P2, triggered: true })]);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p2.runes()).toHaveLength(3);
    expect(game.p2.runes({ ready: true })).toHaveLength(2);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.p1.points()).toBe(0);
  });

  test("negative space — only the controller's Beginning Phase holds: across the opponent's turn no trigger, no extra runes for anyone (P2 just channels its normal 2)", async () => {
    const game = await scenario().turn(3).active(P1).battlefield("bf1", { controller: P1, def: CARD, inert: false }).unit(P1, "bf1", { might: 2, name: "Sentry" }, "sentry").build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p2.runes()).toHaveLength(2);
    expect(game.p2.runes({ ready: true })).toHaveLength(2);
    expect(game.p1.points()).toBe(0);
  });

  test("negative space — conquering the Papertree is not holding it: +1 point, no chain item, nobody channels", async () => {
    const game = await scenario().battlefield("bf1", { controller: null, def: CARD, inert: false }).unit(P1, "base", { might: 2, name: "Scout" }, "scout").build();
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p2.runes()).toHaveLength(0);
    expect(game.chain()).toEqual([]);
  });

  // BUG — expected (471.2.b / 053.3 "here"): also holding a second, plain battlefield in the same
  // Beginning Phase is not "holding here" — exactly one Papertree item, each player +1 rune (P1 ends on
  // 3, P2 on 1). Actual: the controller-scoped hold trigger ignores `location: "here"` and fires once per
  // battlefield held — two items, P1 ends on 4 runes and P2 on 2.
  test.failing("BUG: 'When you hold HERE' — holding another battlefield too must not fire the Papertree a second time", async () => {
    const game = await aboutToHold().battlefield("bf2", { controller: P1 }).unit(P1, "bf2", { might: 2, name: "Other" }, "other").build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(2);
    expect(game.chain().filter((i) => i.cardId === "bf1")).toHaveLength(1);
    await game.settle();
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p2.runes()).toHaveLength(1);
  });

  test("partner — Blue Sentinel here doubles the hold effect: two Papertree items, each player channels 2 exhausted (P1: 4 runes / 2 ready; P2: 2 runes / 0 ready)", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1, def: CARD, inert: false }).unit(P1, "bf1", BLUE_SENTINEL, "bs").build();
    await game.p2.endTurn();
    expect(game.chain().filter((i) => i.cardId === "bf1")).toHaveLength(2);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.runes()).toHaveLength(4);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.p2.runes()).toHaveLength(2);
    expect(game.p2.runes({ ready: true })).toHaveLength(0);
    expect(game.p1.points()).toBe(1);
  });

  test("registry payload: one triggered ability — hold, by the controller, here — channeling 1 exhausted rune for each player", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "The Papertree" });
    expect(def?.abilities).toEqual([
      {
        effect: { amount: 1, exhausted: true, player: "each", type: "channel" },
        trigger: { event: "hold", location: "here", on: "controller" },
        type: "triggered",
      },
    ]);
  });
});
