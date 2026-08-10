/**
 * Ruling 8d5a2a17928cf541 — Obelisk of Power (OGN-284 → ogn-284-298) · Battlefield
 *   "At the start of each player's first Beginning Phase, that player channels 1 rune."
 *
 * Q: How does Obelisk of Power work?
 * A: A one-time boost: it triggers once per player, in that player's FIRST Beginning Phase only (not every turn); the
 *    trigger is declared, its rune channeled, then the normal runes for the turn, then the draw. Multiple Obelisks stack
 *    (one extra rune each). It triggers even while uncontrolled — the turn player puts it on the chain.
 *    (Missed-trigger tournament policy is a judge procedure, not engine behaviour — not tested.)
 * Rules: 315.2.a (start-of-Beginning-Phase triggers before Channel 315.3 / Draw), 383 (triggered → chain item),
 *        190.6.b (uncontrolled battlefield: turn player controls the trigger), 430.2.a (channeled ready).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const OBELISK = "ogn-284-298";

/** End of P2's turn 2 → P1's first Beginning Phase is next. One (or two) live, UNCONTROLLED Obelisk battlefield(s), nobody on them. */
function board(obelisks = 1) {
  const s = scenario().turn(2).active(P2).battlefield("obelisk", { controller: null, def: OBELISK, inert: false });
  return obelisks === 2 ? s.battlefield("obelisk2", { controller: null, def: OBELISK, inert: false }) : s;
}

describe("Ruling 8d5a2a17928cf541 — Obelisk of Power: one extra rune, once per player, on their first Beginning Phase", () => {
  test("trigger timing: as P1's first Beginning Phase starts the Obelisk trigger is on the chain — controlled by the TURN player although nobody controls the battlefield — and nothing is channeled while it is pending", async () => {
    const game = await board().build();
    expect(game.p1.runes()).toHaveLength(0);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.gameState.battlefields.obelisk?.controller ?? null).toBeNull();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "obelisk", controller: P1, triggered: true })]);
    expect(game.p1.runes()).toHaveLength(0);
  });

  test("sequence: the Obelisk rune, then the normal 2 of the Channel Phase, then the draw → P1 starts the main phase with 3 READY runes and drew 1", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.runes({ ready: true })).toHaveLength(3);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.p2.runes()).toHaveLength(0); // "that player" only
    expect(game.violations()).toEqual([]);
  });

  test("'each player's': P2's own first Beginning Phase triggers it too (P2 → 3 runes)", async () => {
    const game = await board().build();
    await game.advanceTurn(); // P1's first
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "obelisk", controller: P2, triggered: true })]);
    await game.settle();
    expect(game.p2.runes()).toHaveLength(3);
    expect(game.p1.runes()).toHaveLength(3);
  });

  test("one-time, not every turn: each player's SECOND Beginning Phase adds nothing to the chain and channels only the normal 2 (3 → 5)", async () => {
    const game = await board().build();
    await game.advanceTurn(); // P1: 3
    await game.advanceTurn(); // P2: 3
    await game.p2.endTurn(); // → P1's second Beginning Phase
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.runes()).toHaveLength(5);
    await game.advanceTurn(); // → P2's second
    expect(game.p2.runes()).toHaveLength(5);
  });

  test("stacking: with TWO Obelisks in play both trigger on P1's first Beginning Phase (two chain items) → 1 + 1 + 2 = 4 runes", async () => {
    const game = await board(2).build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "obelisk", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "obelisk2", controller: P1, triggered: true }),
    ]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.runes()).toHaveLength(4);
    await game.advanceTurn();
    expect(game.p2.runes()).toHaveLength(4);
  });
});
