/**
 * Ruling cce16036969da5d4 — Forgotten Monument (SFD-209 → sfd-209-221) · Battlefield
 *     "Players can't score here until their third turn."
 *   × Renata Glasc, Mastermind (SFD-088 → sfd-088-221) · 4 Might "[1][mind]: Draw 1. [4][mind]x4, [Exhaust]: Score 1 point.
 *     Use my abilities only while I'm at a battlefield."  (+ Plundering Poro SFD-069 as a conquer-trigger probe)
 *
 * Q: Does Forgotten Monument work the same as Tianna (blanket "can't score")?
 * A: It prevents the whole SCORING PROCESS there: no conquer triggers, no hold triggers, no points from those. "Extra"
 *    points such as Renata Glasc, Mastermind's are unaffected. You still gain CONTROL after a showdown — you just don't
 *    conquer (score) it.
 * Rules: 469/471 (Score = Conquer or Hold; 471.2.c conquer/hold abilities trigger only when the battlefield is Scored),
 *        466.5 / 190.4 (control is established regardless), "score 1 point" effects are not battlefield scoring.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FORGOTTEN_MONUMENT = "sfd-209-221";
const RENATA = "sfd-088-221";
const PLUNDERING_PORO = "sfd-069-221"; // 2 Might · When I conquer, play a Gold gear token exhausted.

const turnsTaken = (game: Game, seat: string) => game.gameState.players[seat]?.turnsTaken;
const goldOf = (game: Game, seat: "p1" | "p2") => game[seat].gear().filter((id) => game.state(id).name === "Gold");

describe("Ruling cce16036969da5d4 — Forgotten Monument blocks the scoring process (points AND conquer triggers) but not control or extra points", () => {
  test("P1's FIRST turn: Plundering Poro walks onto the empty Monument → P1 CONTROLS it, but scores 0 points and the 'When I conquer' Gold trigger never fires", async () => {
    const game = await scenario()
      .turn(2)
      .battlefield("monument", { controller: null, def: FORGOTTEN_MONUMENT, inert: false, owner: P2 })
      .unit(P1, "base", PLUNDERING_PORO, "poro")
      .build();
    expect(turnsTaken(game, P1)).toBe(1);
    await game.p1.move("poro", "monument");
    await game.settle();
    await game.settle();
    expect(game.locationOf("poro")).toBe("monument");
    expect(game.gameState.battlefields.monument?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(goldOf(game, "p1")).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control: the same walk onto an ordinary battlefield scores 1 and makes a Gold", async () => {
    const game = await scenario()
      .turn(2)
      .battlefield("plain", { controller: null })
      .unit(P1, "base", PLUNDERING_PORO, "poro")
      .build();
    await game.p1.move("poro", "plain");
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.plain?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(goldOf(game, "p1")).toHaveLength(1);
  });

  test("winning a SHOWDOWN there on your first turn: the 5-Might attacker kills the 2-Might holder and P1 gains control of the Monument — still 0 points", async () => {
    const game = await scenario()
      .turn(2)
      .battlefield("monument", { controller: P2, def: FORGOTTEN_MONUMENT, inert: false, owner: P2 })
      .unit(P2, "monument", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 5, name: "Brute" }, "brute")
      .build();
    await game.p1.move("brute", "monument");
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.locationOf("brute")).toBe("monument");
    expect(game.gameState.battlefields.monument?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0);
  });

  test("holding it at the start of your SECOND turn: no hold point either (control kept)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("monument", { controller: P1, def: FORGOTTEN_MONUMENT, inert: false, owner: P1 })
      .unit(P1, "monument", { might: 3, name: "Sitter" }, "sitter")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(turnsTaken(game, P1)).toBe(2);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.monument?.controller).toBe(P1);
  });

  test("'extra' points are unaffected: Renata Glasc, Mastermind AT the Monument on P1's first turn pays [4][mind]x4 + exhaust and scores 1 point", async () => {
    const game = await scenario()
      .turn(2)
      .resources(P1, { energy: 4, power: { mind: 4 } })
      .battlefield("monument", { controller: P1, def: FORGOTTEN_MONUMENT, inert: false, owner: P1 })
      .unit(P1, "monument", RENATA, "renata")
      .build();
    expect(turnsTaken(game, P1)).toBe(1);
    expect(game.p1.points()).toBe(0);
    await game.p1.activate("renata", 1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.state("renata").isExhausted).toBe(true);
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.monument?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
