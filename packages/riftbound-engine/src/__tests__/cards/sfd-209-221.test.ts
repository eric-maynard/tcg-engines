/**
 * Forgotten Monument — sfd-209-221 · Battlefield · no domain · no cost
 *
 *   Players can't score here until their third turn.
 *
 * Rules: 469 (Score = Conquer (gain control) or Hold (keep control in your Beginning Phase)),
 * 471 (a Score = up to 1 point AND the Conquer/Hold abilities trigger; 471.2.c — those abilities
 * trigger ONLY when the battlefield is Scored), 469.1.b / 466.5 (control is still established even
 * when no Score happens), 190.4 (control), "their third turn" = counted per PLAYER (the player's own
 * turn count, not the game's turn number).
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. "Can't score" ≠ "can't control": conquering the Monument on your 1st/2nd turn still takes it
 *     (controller flips, the unit stays), it just yields no point.
 *  2. No Score → NO conquer/hold triggers here (471.2.c): Plundering Poro conquering it early makes no
 *     Gold; Ahri holding it early scores nothing at all.
 *  3. Per player: on game turn N one player may be on their 3rd turn while the other is on their 2nd —
 *     the gate opens for each player separately.
 *  4. "here" only: every other battlefield scores normally from turn one.
 *  5. Passive payoff: a unit parked there early simply starts producing hold points from its
 *     controller's third turn on, with no further action.
 *  6. From the third turn on it is a completely normal battlefield: conquer by combat scores and
 *     conquer triggers fire.
 *
 * Scenario note: `scenario().turn(n)` seeds each player's turn count as max(1, floor(n / 2)) and every
 * turn start adds one for the new turn player — the tests read `players[seat].turnsTaken` to state it.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-209-221";
const PORO = "sfd-069-221"; // Plundering Poro · 2 Might · When I conquer, play a Gold gear token exhausted.
const AHRI = "ogn-066-298"; // Ahri, Alluring · When I hold, you score 1 point.

const turnsTaken = (game: Game, seat: string) => game.gameState.players[seat]?.turnsTaken;
const goldOf = (game: Game, seat: "p1" | "p2") => game[seat].base().filter((id) => game.state(id).name === "Gold");

/** P1's turn at game turn `turn`; the Monument is empty and uncontrolled; P1 has a ready 3-Might walker in base. */
function walkOn(turn: number) {
  return scenario()
    .turn(turn)
    .battlefield("monument", { controller: null, def: CARD, inert: false, owner: P2 })
    .unit(P1, "base", { might: 3, name: "Walker" }, "walker");
}

async function takeMonument(game: Game, unit = "walker", seat: "p1" | "p2" = "p1"): Promise<void> {
  await game[seat].move(unit, "monument");
  await game.settle();
  await game.settle();
  expect(game.locationOf(unit)).toBe("monument");
}

describe("Forgotten Monument (sfd-209-221)", () => {
  test("registry payload: one static prevent-score ability gated on turn-count-at-least 3", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Forgotten Monument" });
    expect(def?.abilities).toEqual([
      { condition: { threshold: 3, type: "turn-count-at-least" }, effect: { type: "prevent-score" }, type: "static" },
    ]);
  });

  test("conquering it on your FIRST turn: you take control (unit stays, controller flips) but score no point", async () => {
    const game = await walkOn(2).build();
    expect(turnsTaken(game, P1)).toBe(1);
    await takeMonument(game);
    expect(game.gameState.battlefields.monument?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("conquering it on your SECOND turn: still no point", async () => {
    const game = await walkOn(4).build();
    expect(turnsTaken(game, P1)).toBe(2);
    await takeMonument(game);
    expect(game.gameState.battlefields.monument?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0);
  });

  test("conquering it on your THIRD turn scores normally (1 point) — control: the inert copy scores on turn one", async () => {
    const game = await walkOn(6).build();
    expect(turnsTaken(game, P1)).toBe(3);
    await takeMonument(game);
    expect(game.p1.points()).toBe(1);

    const inert = await scenario()
      .turn(2)
      .battlefield("monument", { controller: null, def: CARD, inert: true })
      .unit(P1, "base", { might: 3 }, "walker")
      .build();
    await takeMonument(inert);
    expect(inert.p1.points()).toBe(1);
  });

  test("holding it at the start of your SECOND turn scores nothing; you keep control", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("monument", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "monument", { might: 3, name: "Sitter" }, "sitter")
      .build();
    expect(turnsTaken(game, P1)).toBe(1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(turnsTaken(game, P1)).toBe(2);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.monument?.controller).toBe(P1);
  });

  test("holding it at the start of your THIRD turn scores the hold point", async () => {
    const game = await scenario()
      .turn(4)
      .active(P2)
      .battlefield("monument", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "monument", { might: 3, name: "Sitter" }, "sitter")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(turnsTaken(game, P1)).toBe(3);
    expect(game.p1.points()).toBe(1);
  });

  test("passive payoff across turns: parked on turn 1, the sitter yields 0 on P1's 2nd turn and starts paying 1 per turn from P1's 3rd", async () => {
    const game = await walkOn(2).build();
    await takeMonument(game); // P1 turn 1: conquer, no point
    expect(game.p1.points()).toBe(0);
    await game.advanceTurn(); // P2
    await game.advanceTurn(); // P1 2nd turn: hold, no point
    expect(game.turnPlayer()).toBe(P1);
    expect(turnsTaken(game, P1)).toBe(2);
    expect(game.p1.points()).toBe(0);
    await game.advanceTurn(); // P2
    await game.advanceTurn(); // P1 3rd turn: hold scores
    expect(turnsTaken(game, P1)).toBe(3);
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn();
    await game.advanceTurn(); // P1 4th turn
    expect(game.p1.points()).toBe(2);
    expect(game.p2.points()).toBe(0);
  });

  test("'their' is per player: on the same game turn P1 (2nd turn) conquers for nothing, then P2 (3rd turn) conquers it back through combat and scores 1", async () => {
    const game = await scenario()
      .turn(4)
      .battlefield("monument", { controller: null, def: CARD, inert: false, owner: P1 })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .unit(P2, "base", { might: 4, name: "Bruiser" }, "bruiser")
      .build();
    expect(turnsTaken(game, P1)).toBe(2);
    expect(turnsTaken(game, P2)).toBe(2);
    await takeMonument(game, "scout");
    expect(game.p1.points()).toBe(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(turnsTaken(game, P2)).toBe(3);
    await game.p2.move("bruiser", "monument");
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.gameState.battlefields.monument?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
  });

  test("'here' only: on turn one the OTHER battlefield conquers for a point while the Monument does not", async () => {
    const game = await walkOn(2).battlefield("plain", { controller: null }).unit(P1, "base", { might: 2, name: "Second" }, "second").build();
    await game.p1.move("second", "plain");
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.plain?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    await takeMonument(game);
    expect(game.gameState.battlefields.monument?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // unchanged
  });

  test("no Score → no CONQUER trigger (471.2.c): Plundering Poro taking the Monument on turn one gets control, no point and NO Gold token", async () => {
    const game = await scenario()
      .turn(2)
      .battlefield("monument", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P1, "base", PORO, "poro")
      .build();
    await takeMonument(game, "poro");
    expect(game.gameState.battlefields.monument?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(goldOf(game, "p1")).toHaveLength(0);
    expect(game.chain()).toEqual([]);
  });

  test("control for the above: the same Poro conquering the Monument on P1's third turn scores AND plays its Gold", async () => {
    const game = await scenario()
      .turn(6)
      .battlefield("monument", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P1, "base", PORO, "poro")
      .build();
    await takeMonument(game, "poro");
    expect(game.p1.points()).toBe(1);
    expect(goldOf(game, "p1")).toHaveLength(1);
  });

  test("no Score → no HOLD trigger: Ahri ('When I hold, you score 1 point') sitting here on P1's 2nd turn yields 0 points total and no chain item; on the 3rd turn she yields 2", async () => {
    const early = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("monument", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "monument", AHRI, "ahri")
      .build();
    await early.p2.endTurn();
    expect(early.turnPlayer()).toBe(P1);
    expect(early.chain()).toEqual([]);
    await early.settle();
    expect(early.phase()).toBe("main");
    expect(early.p1.points()).toBe(0);

    const later = await scenario()
      .turn(4)
      .active(P2)
      .battlefield("monument", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "monument", AHRI, "ahri")
      .build();
    await later.advanceTurn();
    expect(later.turnPlayer()).toBe(P1);
    expect(later.p1.points()).toBe(2);
  });

  test("early combat conquer: killing the defender on turn one flips control to the attacker, but neither side's score moves", async () => {
    const game = await scenario()
      .turn(2)
      .battlefield("monument", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P2, "monument", { might: 2, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p1.move("raider", "monument");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("raider")).toBe("monument");
    expect(game.gameState.battlefields.monument?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });
});
