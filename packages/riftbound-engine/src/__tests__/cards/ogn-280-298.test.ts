/**
 * Grove of the God-Willow — ogn-280-298 · Battlefield · no domain · no cost
 *
 *   When you hold here, draw 1.
 *
 * Rules: 469.2 (Hold = you keep control of a battlefield during YOUR Beginning Phase), 315.2.b
 * (Scoring Step of the Beginning Phase), 471.2.b (hold abilities trigger at the battlefield that was
 * held), 383.4.d (hold effects are triggered abilities → a chain item, not an [Add]), 190.6.d ("you"
 * on a battlefield = its CONTROLLER; uncontrolled → the instruction is ignored), 190.4/323.6 (control
 * rests on having units there), 471.1.a.1 (the Final-Point restriction is Conquer-only — a Hold at 7
 * wins).
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. Timing: the draw is a triggered chain item raised in the Beginning Phase, so the hand is still
 *     empty while it is pending; after it resolves the Draw Phase adds one more (0 → 2).
 *  2. Controller ≠ owner: P2 sitting on P1's Grove draws on P2's turn; P1 gets nothing.
 *  3. Negative space: CONQUERING the Grove draws nothing; the opponent's Beginning Phase draws
 *     nothing; an uncontrolled/unoccupied Grove draws nobody anything.
 *  4. "here": holding the Grove AND another battlefield draws exactly one extra card.
 *  5. Final point: holding at 7 reaches 8 and wins (hold is not bound by 471.1.b).
 *  6. Partner: Ahri, Alluring ("When I hold, you score 1 point") holding the Grove → both hold
 *     effects fire: 2 points and the extra card.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogn-280-298";
const AHRI = "ogn-066-298"; // Ahri, Alluring · When I hold, you score 1 point.

/** P2 is about to end turn 2; P1 controls the Grove (bf1) with a vanilla unit on it. */
function aboutToHold() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P1 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder");
}

describe("Grove of the God-Willow (ogn-280-298)", () => {
  test("registry payload: a battlefield with exactly one triggered 'hold here (controller)' → draw 1 ability", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Grove of the God-Willow" });
    expect(def?.abilities).toEqual([
      {
        effect: { amount: 1, type: "draw" },
        trigger: { event: "hold", location: "here", on: "controller" },
        type: "triggered",
      },
    ]);
  });

  test("holding it at the start of your turn draws 1 (0 → 2 with the Draw Phase) and scores the hold point", async () => {
    const game = await aboutToHold().build();
    expect(game.p1.hand()).toHaveLength(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p2.hand()).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });

  test("timing: the draw is a triggered chain item raised in the Beginning Phase — hand still empty while it is pending (383.4.d)", async () => {
    const game = await aboutToHold().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", controller: P1, triggered: true })]);
    expect(game.p1.points()).toBe(1); // the point is scored first, the effect triggers off it (383.4.d.2.b)
    expect(game.p1.hand()).toHaveLength(0);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("negative space — only YOUR hold: across the opponent's Beginning Phase the Grove's controller draws nothing", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "bf1", { might: 3 }, "holder")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.hand()).toHaveLength(1); // just P2's draw phase
  });

  test("controller ≠ owner (190.6.d): P2 holding P1's Grove draws on P2's turn; P1 draws nothing", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "bf1", { might: 3 }, "squatter")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p2.hand()).toHaveLength(2);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("negative space — CONQUERING the Grove is not holding it: the conqueror scores but draws nothing", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null, def: CARD, inert: false, owner: P1 })
      .unit(P1, "base", { might: 3 }, "walker")
      .build();
    await game.p1.move("walker", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.chain()).toEqual([]);
  });

  test("negative space — an uncontrolled, empty Grove at the start of P1's turn: no hold, no point, no extra card", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: null, def: CARD, inert: false, owner: P1 }).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("'When you hold HERE' fires once per battlefield held — holding the Grove plus a plain battlefield draws 2 instead of 1 (471.2.b)", async () => {
    // Expected: 2 points, ONE Grove trigger → hand 2 (trigger + draw phase).
    // Actual: two "Grove of the God-Willow" items go on the chain (one per hold) → hand 3.
    const game = await aboutToHold().battlefield("bf2", { controller: P1 }).unit(P1, "bf2", { might: 2 }, "other").build();
    await game.p2.endTurn();
    expect(game.chain().filter((i) => i.cardId === "bf1")).toHaveLength(1);
    await game.settle();
    expect(game.p1.points()).toBe(2);
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("an UNCONTROLLED Grove triggers when the turn player holds a different battlefield (190.6.d — 'you' refers to no one; 471.2.b — only the held battlefield's abilities trigger)", async () => {
    // Expected: P1 holds bf2 only → 1 point, hand 1 (draw phase). Actual: a Grove item goes on the chain and P1 draws → hand 2.
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: null, def: CARD, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 2 }, "other")
      .build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("negative space — P1 holding ANOTHER battlefield while P2 controls the Grove: nobody draws off the Grove", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "bf1", { might: 2 }, "squatter")
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 2 }, "other")
      .build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p2.hand()).toHaveLength(0);
  });

  test("final point: holding the Grove at 7 points reaches the Victory Score and wins (471.1.a.1 — the conquer-only restriction does not apply)", async () => {
    const game = await aboutToHold().points(P1, 7).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("partner — Ahri, Alluring holding the Grove: both hold effects fire → 2 points (hold + Ahri) and the extra card", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "bf1", AHRI, "ahri")
      .build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain().map((i) => i.cardId).sort()).toEqual(["ahri", "bf1"]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(2);
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("multi-turn: the Grove keeps paying while held — two of P1's turns later P1 has drawn 2 extra cards and holds 2 points", async () => {
    const game = await aboutToHold().build();
    await game.advanceTurn(); // P1's turn 3: hold → 1 pt, hand 2
    await game.advanceTurn(); // P2's turn
    await game.advanceTurn(); // P1's turn 5: hold → 2 pts, hand 4
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.p1.hand()).toHaveLength(4);
    expect(game.locationOf("holder")).toBe("bf1");
  });
});
