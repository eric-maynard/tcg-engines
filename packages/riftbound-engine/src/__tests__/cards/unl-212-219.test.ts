/**
 * Frozen Fortress — unl-212-219 · Battlefield · no domain · no cost
 *
 *   At the start of each player's Beginning Phase, deal 1 to each unit here.
 *   (This happens before scoring.)
 *
 * Rules: 315.2.a/.b (Beginning Phase = Beginning Step "start of Beginning Phase" effects, THEN the
 * Scoring Step where the turn player holds), 383.1 ("At [point in time]" triggered ability → a
 * chain item), 190.6.a/.b (the Fortress's controller controls the trigger; uncontrolled → the turn
 * player runs it), 469.2 / 190.4.c (a battlefield emptied before the Scoring Step is not held and
 * becomes uncontrolled), 323.4–5 (lethal damage kills in the following cleanup), 318.3-ish end of
 * turn: damage is cleared from all units as each turn ends, so the ping never accumulates across
 * turns on a unit that survives it.
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. EACH player's Beginning Phase: your units parked there are pinged at the start of your turn
 *     AND at the start of the opponent's turn (they heal in between — a 3-Might unit shows 1
 *     damage on either turn, never 2).
 *  2. "before scoring": a lone 1-Might holder dies first → no hold point and the Fortress goes
 *     uncontrolled; a 2-Might holder survives with 1 damage and does score.
 *  3. "each unit here": every unit at the Fortress takes exactly 1 (three units → 1 each, not 3 to
 *     one), whoever controls them — the opponent's 1-Might garrison dies at the start of YOUR turn;
 *     units in base or at other battlefields are never touched.
 *  4. Empty Fortress: the phase passes harmlessly (no prompt left dangling, no stray damage).
 *  5. It is a real chain item in the Beginning Phase (phase holds until it resolves), controlled by
 *     the Fortress's controller even on the other player's turn.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-212-219";

/** P1 controls the Fortress; `endingTurnOf` is about to end their turn. */
function fortress(endingTurnOf = P2) {
  return scenario()
    .turn(2)
    .active(endingTurnOf)
    .battlefield("fort", { controller: P1, def: CARD, inert: false, owner: P1 })
    .battlefield("other", { controller: P1 })
    .unit(P1, "other", { might: 1, name: "Elsewhere" }, "elsewhere"); // control: a 1-Might holder away from the Fortress
}

describe("Frozen Fortress (unl-212-219)", () => {
  test("registry payload: an 'at the start of ANY player's Beginning Phase' trigger dealing 1 to ALL units here (not optional, no choice)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Frozen Fortress" });
    expect(def?.abilities).toEqual([
      {
        effect: { amount: 1, target: { location: "here", quantity: "all", type: "unit" }, type: "damage" },
        trigger: { event: "beginning-phase", on: "any-player", timing: "at" },
        type: "triggered",
      },
    ]);
  });

  test("start of P1's turn: the Fortress trigger sits on the chain during the Beginning Phase; on resolution the 2-Might holder has 1 damage, survives, and P1 scores the hold AFTER the ping (the 1-Might unit elsewhere is untouched and also holds)", async () => {
    const game = await fortress().unit(P1, "fort", { might: 2, name: "Sentinel" }, "sentinel").build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fort", name: "Frozen Fortress", triggered: true })]);
    expect(game.state("sentinel").damage).toBe(0);
    expect(game.p1.points()).toBe(0); // scoring has not happened yet — the phase holds for the trigger
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.state("sentinel")).toMatchObject({ damage: 1, might: 2, zone: "battlefield-fort" });
    expect(game.state("elsewhere")).toMatchObject({ damage: 0, zone: "battlefield-other" });
    expect(game.p1.points()).toBe(2); // fort + other
    expect(game.violations()).toEqual([]);
  });

  test("'before scoring' — a lone 1-Might holder dies to the ping: no hold point for the Fortress (only 'other' scores) and the Fortress is left uncontrolled", async () => {
    const game = await fortress().unit(P1, "fort", { might: 1, name: "Frostbitten" }, "frost").build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("frost")).toBe("trash");
    expect(game.p1.units("fort")).toEqual([]);
    expect(game.p1.points()).toBe(1); // 'other' only
    expect(game.gameState.battlefields.fort?.controller ?? null).toBeNull();
  });

  test("EACH player's Beginning Phase: P1's 3-Might unit is pinged at the start of P2's turn too — and shows exactly 1 damage there (healed at end of turn, re-dealt), then 1 again on P1's next turn", async () => {
    const game = await fortress(P1).unit(P1, "fort", { might: 3, name: "Yeti" }, "yeti").build();
    expect(game.state("yeti").damage).toBe(0);
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fort", triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.state("yeti").damage).toBe(1);
    expect(game.p2.points()).toBe(0); // P2 holds nothing
    expect(game.p1.points()).toBe(0); // and P1 does not hold on P2's turn
    await game.advanceTurn(); // → P1's turn: healed at end of P2's turn, pinged again
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("yeti")).toMatchObject({ damage: 1, zone: "battlefield-fort" });
    expect(game.p1.points()).toBe(2);
  });

  test("'each unit here': three units at the Fortress take exactly 1 apiece; units in base and at another battlefield take nothing", async () => {
    const game = await fortress()
      .unit(P1, "fort", { might: 3, name: "A" }, "a")
      .unit(P1, "fort", { might: 3, name: "B" }, "b")
      .unit(P1, "fort", { might: 3, name: "C" }, "c")
      .unit(P1, "base", { might: 1, name: "Home" }, "home")
      .unit(P2, "base", { might: 1, name: "Their Home" }, "theirHome")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    for (const id of ["a", "b", "c"]) {
      expect(game.state(id).damage).toBe(1);
    }
    expect(game.state("home")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("elsewhere")).toMatchObject({ damage: 0, zone: "battlefield-other" });
    expect(game.state("theirHome")).toMatchObject({ damage: 0, zone: "base" });
  });

  test("whoever controls them: the OPPONENT's units at a Fortress they control are pinged at the start of MY turn — their 1-Might Garrison dies, their 4-Might Captain keeps the battlefield with 1 damage; nobody scores", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("fort", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "fort", { might: 1, name: "Garrison" }, "garrison")
      .unit(P2, "fort", { might: 4, name: "Captain" }, "captain")
      .build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fort", triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("garrison")).toBe("trash");
    expect(game.state("captain")).toMatchObject({ damage: 1, zone: "battlefield-fort" });
    expect(game.gameState.battlefields.fort?.controller).toBe(P2); // the Captain keeps it
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("P2's own turn start at THEIR Fortress: lone 1-Might garrison dies before P2's Scoring Step → P2 scores nothing and the Fortress is uncontrolled", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("fort", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "fort", { might: 1, name: "Garrison" }, "garrison")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("garrison")).toBe("trash");
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.fort?.controller ?? null).toBeNull();
  });

  test("empty (uncontrolled) Fortress: the Beginning Phase passes harmlessly into P1's main phase — nothing damaged, nothing left on the chain, no prompt dangling", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("fort", { controller: null, def: CARD, inert: false, owner: P1 })
      .unit(P1, "base", { might: 1, name: "Home" }, "home")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.chain()).toEqual([]);
    expect(game.state("home").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("attrition over a full round: a 2-Might holder survives both pings (1 damage each time, healed between) and is still holding two turns later with 2 Fortress hold points banked", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("fort", { controller: P1, def: CARD, inert: false, owner: P1 }).unit(P1, "fort", { might: 2, name: "Sentinel" }, "sentinel").build();
    await game.advanceTurn(); // P1 turn 1: ping, hold
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn(); // P2: ping
    expect(game.state("sentinel")).toMatchObject({ damage: 1, zone: "battlefield-fort" });
    await game.advanceTurn(); // P1 turn 2: ping, hold
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("sentinel")).toMatchObject({ damage: 1, zone: "battlefield-fort" });
    expect(game.p1.points()).toBe(2);
    expect(game.gameState.battlefields.fort?.controller).toBe(P1);
  });

  test("190.6.a — the Fortress's CONTROLLER controls its trigger even during the other player's Beginning Phase; the engine hands the chain item to the turn player", async () => {
    // Expected: with P1 controlling the Fortress, the item that appears at the start of P2's turn is
    // controlled by P1 (and vice versa: P2's Fortress pings on P1's turn under P2's control).
    // Actual: controller is always the turn player.
    const mine = await fortress(P1).unit(P1, "fort", { might: 3, name: "Yeti" }, "yeti").build();
    await mine.p1.endTurn();
    expect(mine.turnPlayer()).toBe(P2);
    expect(mine.chain()).toEqual([expect.objectContaining({ cardId: "fort", controller: P1, triggered: true })]);
    const theirs = await scenario().turn(2).active(P2).battlefield("fort", { controller: P2, def: CARD, inert: false, owner: P1 }).unit(P2, "fort", { might: 4, name: "Captain" }, "captain").build();
    await theirs.p2.endTurn();
    expect(theirs.turnPlayer()).toBe(P1);
    expect(theirs.chain()).toEqual([expect.objectContaining({ cardId: "fort", controller: P2, triggered: true })]);
  });

  test("inert control: the same 1-Might holder on a text-less battlefield is NOT pinged and scores its hold", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("plain", { controller: P1 }).unit(P1, "plain", { might: 1, name: "Frostbitten" }, "frost").build();
    await game.advanceTurn();
    expect(game.state("frost")).toMatchObject({ damage: 0, zone: "battlefield-plain" });
    expect(game.p1.points()).toBe(1);
  });
});
