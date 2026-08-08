/**
 * The Arena's Greatest — ogn-290-298 · Battlefield
 *
 *   At the start of each player's first Beginning Phase, that player gains 1 point.
 *
 * Rules: 315.2.a (start-of-Beginning-Phase effects happen in the Beginning Step, BEFORE the
 * Scoring Step's Hold, 315.2.b); 190.6.b (an uncontrolled battlefield's trigger is added to the
 * chain by the TURN PLAYER, who then receives priority — the rule's own example is this card);
 * 190.6.a/c ("that player" gains the point no matter who controls the battlefield); 382/383
 * (it is a triggered ability → a chain item both players may respond to; the phase holds);
 * 467 / victory score (a point is a point — the 8th one wins even if it is not a Conquer/Hold).
 *
 * Harness note: a built scenario has seen no Beginning Phase yet, so each player's NEXT Beginning
 * Phase is that player's first; the one after that is their second.
 *
 * Head-judge corner cases for THIS card:
 *   1. "each player's" — BOTH players get exactly one point each, on their own first Beginning
 *      Phase, and never again (4 turn advances → 1/1, not 2/2). Three players → 1/1/1.
 *   2. "that player" — P1 controlling the Arena does not redirect P2's point to P1.
 *   3. Before scoring: while the trigger sits on the chain the phase is still "beginning" and no
 *      Hold point has been awarded yet; after it resolves the controller ALSO holds (0 → 2).
 *   4. It is a real chain item: the turn player holds priority first, the opponent may respond;
 *      the point is only gained on resolution (still 0 after one pass).
 *   5. The point can be the winning point (7 → 8 ends the game).
 *   6. Inert copy (abilities stripped — the harness default) does nothing: proves the point comes
 *      from the printed ability, not from turn structure.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, P3, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ogn-290-298";

function arena(controller: typeof P1 | null = null) {
  return scenario().battlefield("ag", { controller, def: CARD, inert: false, owner: P1 });
}

describe("The Arena's Greatest (ogn-290-298)", () => {
  test("registry payload: a Beginning-Phase trigger for ANY player, restricted to once per game (per player), scoring 1", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "The Arena's Greatest" });
    expect(def?.abilities).toEqual([
      {
        effect: { amount: 1, type: "score" },
        trigger: { event: "beginning-phase", on: "any-player", restrictions: [{ type: "once-per-game" }], timing: "at" },
        type: "triggered",
      },
    ]);
  });

  test("uncontrolled Arena, P1 ends turn → at the start of P2's first Beginning Phase a triggered item goes on the chain, added by the turn player (190.6.b), phase holds at 'beginning'", async () => {
    const game = await arena(null).build();
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "ag", controller: P2, name: "The Arena's Greatest", triggered: true }),
    ]);
    const d = game.decision() as ActionDecision;
    expect(d).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.points()).toBe(0); // nothing gained until it resolves
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("it is a real chain item: after the turn player passes, the opponent holds priority and the point is still not gained; both pass → +1", async () => {
    const game = await arena(null).build();
    await game.p1.endTurn();
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.chain()).toHaveLength(1);
    expect(game.p2.points()).toBe(0);
    await game.p1.passPriority();
    expect(game.chain()).toHaveLength(0);
    expect(game.p2.points()).toBe(1);
  });

  test("'each player's FIRST' — over four turn advances each player gains exactly one point (P2 on turn 1→2, P1 on 2→3, then nothing)", async () => {
    const game = await arena(null).build();
    await game.advanceTurn(); // P2's first Beginning Phase
    expect([game.p1.points(), game.p2.points()]).toEqual([0, 1]);
    await game.advanceTurn(); // P1's first
    expect([game.p1.points(), game.p2.points()]).toEqual([1, 1]);
    await game.advanceTurn(); // P2's second — nothing
    expect([game.p1.points(), game.p2.points()]).toEqual([1, 1]);
    await game.advanceTurn(); // P1's second — nothing
    expect([game.p1.points(), game.p2.points()]).toEqual([1, 1]);
  });

  test("negative space: on a player's SECOND Beginning Phase no trigger is even put on the chain", async () => {
    const game = await arena(null).build();
    await game.advanceTurn(); // P2 first (+1)
    await game.advanceTurn(); // P1 first (+1)
    await game.p1.endTurn(); // → P2's second Beginning Phase
    expect(game.turnPlayer()).toBe(P2);
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p2.points()).toBe(1);
  });

  test("'that player' (190.6.a/c): P1 CONTROLS the Arena, yet P2's first Beginning Phase gives the point to P2, not to the controller", async () => {
    const game = await arena(P1).unit(P1, "ag", { might: 2, name: "Champion of the Sands" }, "champ").build();
    await game.p1.endTurn();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ag", triggered: true })]);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
  });

  test("before scoring (315.2.a → 315.2.b): the controller's own first Beginning Phase gives the Arena point AND THEN the Hold point (0 → 2), with no Hold awarded while the trigger is pending", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("ag", { controller: P1, def: CARD, inert: false, owner: P2 })
      .unit(P1, "ag", { might: 2, name: "Holder" }, "holder")
      .build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ag", controller: P1, triggered: true })]);
    expect(game.p1.points()).toBe(0); // neither the Arena point nor the Hold yet
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(2);
    expect(game.gameState.battlefields.ag?.controller).toBe(P1);
  });

  test("the Arena point can be the winning point: P2 at 7 (victory 8) wins at the start of their first Beginning Phase", async () => {
    const game = await arena(null).points(P2, 7).victoryScore(8).build();
    await game.p1.endTurn();
    await game.settle();
    expect(game.p2.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
  });

  test("one short: P2 at 6 reaches 7 and the game continues into P2's main phase", async () => {
    const game = await arena(null).points(P2, 6).victoryScore(8).build();
    await game.advanceTurn();
    expect(game.p2.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
  });

  test("three players: each of the three gains exactly one point on their own first Beginning Phase, none on the second lap", async () => {
    const game = await scenario({ players: 3 }).battlefield("ag", { controller: null, def: CARD, inert: false, owner: P1 }).build();
    const pts = () => [game.p1.points(), game.p2.points(), game.seat(P3).points()];
    await game.advanceTurn();
    expect(pts()).toEqual([0, 1, 0]);
    await game.advanceTurn();
    expect(pts()).toEqual([0, 1, 1]);
    await game.advanceTurn();
    expect(pts()).toEqual([1, 1, 1]);
    await game.advanceTurn();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(pts()).toEqual([1, 1, 1]);
  });

  test("negative space: an inert copy (abilities stripped) awards nothing — the point comes from the printed ability, not from turn structure", async () => {
    const game = await scenario().battlefield("ag", { controller: null, def: CARD, inert: true, owner: P1 }).build();
    await game.p1.endTurn();
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    await game.advanceTurn();
    expect([game.p1.points(), game.p2.points()]).toEqual([0, 0]);
  });
});
