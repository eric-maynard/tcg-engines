/**
 * Loose Cannon — ogn-251-298 · Legend (Jinx) · Fury/Chaos
 *
 *   At start of your Beginning Phase, draw 1 if you have one or fewer cards
 *   in your hand.
 *
 * Turn structure reminder: Awaken → Beginning (this trigger; the phase holds
 * while it sits on the chain) → Channel → Draw (+1 card) → Main. So across a
 * turn advance the legend's controller gains 2 cards when the trigger draws
 * and 1 card otherwise.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const LOOSE_CANNON = "ogn-251-298";
const FILLER = "ogn-175-298"; // vanilla unit used as hand padding

/** P2 is about to end their turn; P1 controls Loose Cannon with `handSize` cards. */
function beforeP1Turn(handSize: number) {
  const b = scenario().turn(2).active(P2).legend(P1, LOOSE_CANNON, "lc");
  for (let i = 0; i < handSize; i++) {
    b.hand(P1, FILLER);
  }
  return b;
}

describe("Loose Cannon (ogn-251-298)", () => {
  test("draws 1 at the start of your Beginning Phase with an empty hand (0 → 2 after the draw phase)", async () => {
    const game = await beforeP1Turn(0).build();
    await game.p2.endTurn();
    // The trigger is on the chain and the Beginning Phase is holding for it.
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    const d = game.decision() as ActionDecision;
    expect(d).toMatchObject({ context: "chain", kind: "action", seat: P1, source: { cardId: "lc" } });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "lc", controller: P1, name: "Loose Cannon", triggered: true }),
    ]);
    expect(game.p1.hand()).toHaveLength(0);
    await game.settle(); // P1 passes, P2 passes → draw 1 → channel → draw → main
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.runes()).toHaveLength(2); // channel still happened afterwards
  });

  test("draws with exactly one card in hand (1 → 3)", async () => {
    const game = await beforeP1Turn(1).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.hand()).toHaveLength(3);
  });

  test("does NOT draw with two or more cards in hand (2 → 3: only the draw phase card)", async () => {
    const game = await beforeP1Turn(2).build();
    await game.advanceTurn();
    expect(game.p1.hand()).toHaveLength(3);
    const four = await beforeP1Turn(4).build();
    await four.advanceTurn();
    expect(four.p1.hand()).toHaveLength(5);
  });

  test("only YOUR Beginning Phase: nothing happens when the opponent's turn begins", async () => {
    const game = await scenario().turn(3).active(P1).legend(P1, LOOSE_CANNON, "lc").build();
    expect(game.p1.hand()).toHaveLength(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.hand()).toHaveLength(0);
    // No trigger was put on the chain during P2's beginning phase.
    expect(game.transcript().steps.map((s) => s.executed.map((e) => e.moveId).join("+"))).toEqual(["endTurn"]);
  });

  test("the condition is checked when the trigger resolves (drawing up to 2+ in response turns it off)", async () => {
    // P1 starts the turn with 1 card; before the trigger resolves P1 gains cards some other way.
    // We model "some other way" with the sandbox draw move while P1 holds priority.
    const game = await beforeP1Turn(1).build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    await game.p1.do("drawCard", { count: 1 }); // now 2 in hand, trigger still on the chain
    expect(game.p1.hand()).toHaveLength(2);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(3); // no trigger draw, +1 draw phase
  });
});
