/**
 * Ruling 0ae10dff83378a8f — Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · 2+[chaos] · Action
 *   "Move a friendly unit and ready it."
 *
 * Q: (Multiplayer) Can Player C use Ride the Wind to move a unit into a showdown between Player A and Player B?
 * A: No. Any action that would put units of THREE players at one battlefield is illegal — a unit cannot move, by any
 *    means, to a battlefield that already has units from two other players (or an ongoing combat between two other
 *    players); such a destination simply can't be chosen.
 * Rules: 449.2 / 144.4.a.1 (no move to a battlefield with units of 2 other players / a 2-other-player combat),
 *        347.2.b (Focus passes in turn order during a showdown), 355.4 (destinations).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, P3, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/**
 * 3 players. bf1 holds P2's Guard (3) AND P1's Raider (4) — two other players from P3's point of view. P3 holds bf2
 * with a Scout (2), has a Runner (2) in base and Ride the Wind with exactly 2+[chaos]. bf3 is open.
 */
function board(active: string) {
  return scenario({ players: 3 })
    .turn(3)
    .active(active)
    .resources(P3, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P3 })
    .battlefield("bf3", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P3, "bf2", { might: 2, name: "Scout" }, "scout")
    .unit(P3, "base", { might: 2, name: "Runner" }, "runner")
    .hand(P3, RIDE_THE_WIND, "rtw");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const p3 = (game: Game) => game.seat(P3);

/** P3's turn with A's and B's units both already present at bf1. */
async function p3TurnTwoOthersAtBf1(): Promise<Game> {
  const game = await board(P3).unit(P1, "bf1", { might: 4, name: "Raider" }, "raider").build();
  expect(new Set(game.cardsAt("battlefield-bf1").map((c) => game.state(c).controller))).toEqual(new Set([P1, P2]));
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P3 });
  return game;
}

/** Cast Ride the Wind on `unit` and drive to its destination prompt (asked of P3). */
async function rideAndGetDestinations(game: Game, unit: string): Promise<string[]> {
  await p3(game).cast("rtw", { targets: unit });
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P3) {
      expect(d).toMatchObject({ semantics: "destination", source: { pendingChoiceType: "choose-destination" } });
      return d.options.map((o) => o.zone ?? o.key);
    }
    if (d?.kind === "action") {
      await game.acting().passPriority();
    } else {
      break;
    }
  }
  return [];
}

describe("Ruling 0ae10dff83378a8f — a third player can never move a unit to a battlefield where two other players already are", () => {
  test("Ride the Wind on P3's Runner: the destination prompt offers bf2 and bf3 but NOT bf1 (units of P1 and P2 there — 449.2)", async () => {
    const game = await p3TurnTwoOthersAtBf1();
    const dests = await rideAndGetDestinations(game, "runner");
    expect(dests).toEqual(expect.arrayContaining(["battlefield-bf2", "battlefield-bf3"]));
    expect(dests).not.toContain("battlefield-bf1");
  });

  test("forcing bf1 is rejected; picking bf3 resolves normally — Runner arrives at bf3 READY, and bf1 still holds only P1's and P2's units", async () => {
    const game = await p3TurnTwoOthersAtBf1();
    await rideAndGetDestinations(game, "runner");
    const r = await p3(game).try((p) => p.pick("battlefield-bf1"));
    expect(r.ok).toBe(false);
    await p3(game).pick("battlefield-bf3");
    await game.settle();
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("runner")).toBe("bf3");
    expect(game.state("runner").isReady).toBe(true);
    expect(new Set(game.cardsAt("battlefield-bf1").map((c) => game.state(c).controller))).toEqual(new Set([P1, P2]));
    expect(game.violations()).toEqual([]);
  });

  test("the same restriction applies to a plain Standard Move 'by any means': P3's Runner may move to bf2/bf3 but bf1 is not on the menu", async () => {
    const game = await p3TurnTwoOthersAtBf1();
    const moveDests = p3(game)
      .legal()
      .filter((o) => o.moveId === "standardMove" && o.fields.some((f) => (f.options ?? []).flat().includes("runner")))
      .map((o) => o.key);
    expect(moveDests.some((k) => k.includes("bf3"))).toBe(true);
    expect(moveDests.some((k) => k.includes("bf1"))).toBe(false);
    const r = await p3(game).try((p) => p.move("runner", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("runner")).toBe("base");
  });

  // The literal scenario of the question: P1 (A) attacks P2 (B) at bf1 on P1's turn and, while that showdown is open,
  // P3 (C) — who receives Focus in turn order (347.2.b: A passes → B, B passes → C) — tries to Ride the Wind in.
  test("the literal case: during the A-vs-B showdown at bf1 Focus reaches P3 in turn order; P3 may cast Ride the Wind there, but bf1 (a combat between two OTHER players, 144.4.a.1) is not a legal destination", async () => {
    const game = await board(P1).unit(P1, "base", { might: 4, name: "Raider" }, "raider").build();
    await game.p1.move("raider", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, focusPlayer: P1 });
    await game.p1.passFocus(); // A passes → B
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2 });
    await game.p2.passFocus(); // B passes → C (turn order), showdown still open
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P3 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P3 });
    expect(p3(game).can("cast", "rtw")).toBe(true);
    const dests = await rideAndGetDestinations(game, "runner");
    expect(dests.length).toBeGreaterThan(0);
    expect(dests).not.toContain("battlefield-bf1"); // 144.4.a.1 — a combat with 2 other players as participants
  });
});
