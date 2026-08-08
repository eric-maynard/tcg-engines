/**
 * Obelisk of Power — ogn-284-298 · Battlefield · no domain · no cost
 *
 *   At the start of each player's first Beginning Phase, that player channels 1 rune.
 *
 * Rules: 315.2.a (start-of-Beginning-Phase effects happen in the Beginning Step, BEFORE the Scoring
 * Step, the Channel Phase (315.3: +2 runes) and the Draw Phase), 383 (it is a triggered ability → a
 * chain item both players may respond to; nothing is channeled while it is pending), 430.2.a (a
 * channeled rune enters READY unless told otherwise), 430.3 (channel as many as possible), 190.6.b
 * (an UNCONTROLLED battlefield's ability is put on the chain by the Turn Player, who is treated as
 * its controller), 190.6.d does NOT apply — the text names "that player", not "you", so it works no
 * matter who (if anyone) controls the Obelisk.
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. "each player's": BOTH players get it, each on their own first Beginning Phase — P2's first
 *     still fires after P1's first already did.
 *  2. "first": the same player's SECOND Beginning Phase channels nothing extra (3 → 5, not 6).
 *  3. "that player": the TURN player channels from THEIR rune deck even when the opponent owns
 *     the card and controls the battlefield with a unit on it; the controller gets nothing.
 *  4. Ordering inside the turn: the rune arrives from the trigger (Beginning Step) and the Channel
 *     Phase still adds its normal 2 afterwards → exactly 3 ready runes in the first main phase.
 *  5. It stacks with a Hold: a player who controls the Obelisk with a unit both scores the hold
 *     point and (first time only) channels the extra rune.
 *  6. Short rune deck (430.3): with only 2 runes left the player ends on 2 runes, no error.
 *
 * Scenario note: a scenario starts with an empty game history, so the first Beginning Phase each
 * player reaches after `build()` is treated as that player's first of the game.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogn-284-298";

/** P2 is about to end turn 2; the Obelisk is bf1 (uncontrolled, nobody there). */
function beforeP1FirstTurn() {
  return scenario().turn(2).active(P2).battlefield("obelisk", { controller: null, def: CARD, inert: false, owner: P2 });
}

describe("Obelisk of Power (ogn-284-298)", () => {
  test("registry payload: a battlefield whose single ability is an any-player, once-per-game Beginning-Phase trigger that channels 1", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Obelisk of Power" });
    expect(def?.abilities).toEqual([
      {
        effect: { amount: 1, type: "channel" },
        trigger: { event: "beginning-phase", on: "any-player", restrictions: [{ type: "once-per-game" }], timing: "at" },
        type: "triggered",
      },
    ]);
  });

  test("P1's first Beginning Phase: a triggered chain item (put there by the turn player, 190.6.b) — nothing channeled while pending, then 1 + the Channel Phase's 2 = 3 READY runes", async () => {
    const game = await beforeP1FirstTurn().build();
    expect(game.p1.runes()).toHaveLength(0);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "obelisk", controller: P1, name: "Obelisk of Power", triggered: true })]);
    expect(game.p1.runes()).toHaveLength(0); // 383: pending, not yet resolved
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.runes({ ready: true })).toHaveLength(3); // 430.2.a — channeled ready
    expect(game.p2.runes()).toHaveLength(0);
    expect(game.p1.points()).toBe(0); // an empty Obelisk is not held
    expect(game.violations()).toEqual([]);
  });

  test("'each player's': P2's first Beginning Phase fires too, after P1's already did (P1 3 runes, then P2 3 runes)", async () => {
    const game = await beforeP1FirstTurn().build();
    await game.advanceTurn(); // → P1 (first)
    expect(game.p1.runes()).toHaveLength(3);
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "obelisk", controller: P2, triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p2.runes()).toHaveLength(3);
    expect(game.p1.runes()).toHaveLength(3); // P1 got nothing off P2's trigger
  });

  test("'first': a player's SECOND Beginning Phase puts nothing on the chain and channels only the normal 2 (3 → 5)", async () => {
    const game = await beforeP1FirstTurn().build();
    await game.advanceTurn(); // P1 first: 3
    await game.advanceTurn(); // P2 first: 3
    expect(game.p2.runes()).toHaveLength(3);
    await game.p2.endTurn(); // → P1's second Beginning Phase
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.runes()).toHaveLength(5);
    await game.advanceTurn(); // → P2's second
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.runes()).toHaveLength(5);
  });

  test("'that player' is the TURN player: P1 owns the card and controls the Obelisk with a unit on it, yet on P2's first turn P2 channels 3 and P1 channels nothing", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("obelisk", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "obelisk", { might: 3, name: "Sentinel" }, "sentinel")
      .build();
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "obelisk", triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p2.runes()).toHaveLength(3);
    expect(game.p2.runes({ ready: true })).toHaveLength(3);
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p2.points()).toBe(0); // P2 holds nothing
    expect(game.locationOf("sentinel")).toBe("obelisk");
  });

  test("stacks with a Hold: P1 controlling the Obelisk with a unit at the start of P1's first turn scores 1 AND channels the extra rune", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("obelisk", { controller: P1, def: CARD, inert: false, owner: P2 })
      .unit(P1, "obelisk", { might: 3, name: "Sentinel" }, "sentinel")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.hand()).toHaveLength(1); // just the draw phase — the Obelisk draws nothing
  });

  test("negative space — an inert (abilities-stripped) Obelisk gives the plain 2 runes, so the third rune above came from the printed trigger", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("obelisk", { controller: null, def: CARD, inert: true }).build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(2);
  });

  test("the effect channels — it does not draw, score, or add floating energy/power", async () => {
    const game = await beforeP1FirstTurn().build();
    await game.advanceTurn();
    expect(game.p1.hand()).toHaveLength(1); // draw phase only
    expect(game.p1.points()).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.runeDeck()).toHaveLength(12 - 3);
  });

  test("short rune deck (430.3): with exactly 2 runes left, the trigger takes 1 and the Channel Phase takes the last one — 2 runes, empty rune deck, no error", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("obelisk", { controller: null, def: CARD, inert: false })
      .fillDecks({ main: 10, runes: 2 })
      .build();
    expect(game.p1.runeDeck()).toHaveLength(2);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runeDeck()).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });

  test("responding window: the opponent also receives priority on the pending Obelisk trigger before it resolves", async () => {
    const game = await beforeP1FirstTurn().build();
    await game.p2.endTurn();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.runes()).toHaveLength(0);
    await game.p2.passPriority();
    // Resolved: the rune is on the board before the Channel Phase adds its two.
    expect(game.p1.runes().length).toBeGreaterThanOrEqual(1);
    await game.settle();
    expect(game.p1.runes()).toHaveLength(3);
  });
});
