/**
 * Ruling e5f3111021bf14a6 — Ride the Wind (OGN-173 → ogn-173-298) · [Action] spell · [2][chaos]
 *   "Move a friendly unit and ready it."
 *
 * Q: I move a unit to an EMPTY battlefield; my opponent then Ride the Winds a unit into the same battlefield during
 *    that showdown. Are we both attackers?
 * A: No. Whoever contested the battlefield FIRST is the attacker; the one who arrives afterwards is the defender.
 *    The battlefield is not contested a second time.
 * Rules: 187.3.a.1 (an arriving unit applies Contested), 437 / 459 (attacker & defender designations), 344.2 (showdowns).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn. bf1 is empty and uncontrolled; both players have a unit in base and P2 holds Ride the Wind. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 3, name: "Rider" }, "rider", { exhausted: true })
    .hand(P2, RIDE_THE_WIND, "wind")
    .resources(P2, { energy: 2, power: { chaos: 1 } });
}

/** P1 arrives first at the empty battlefield, then passes focus to P2. */
async function firstArrival(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  expect(game.locationOf("scout")).toBe("bf1");
  await game.p1.passFocus();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

/** …and P2 rides in during that showdown. */
async function bothPresent(): Promise<Game> {
  const game = await firstArrival();
  await game.p2.cast("wind", { answers: ["bf1"], targets: "rider" });
  await game.acting().passPriority();
  await game.acting().passPriority();
  expect(game.locationOf("rider")).toBe("bf1");
  return game;
}

describe("Ruling e5f3111021bf14a6 — the first unit to contest is the attacker; the one riding in afterwards defends", () => {
  test("P1 arriving alone at the empty battlefield opens a showdown with P1 contesting it", async () => {
    const game = await firstArrival();
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBe(null);
    expect(game.p2.units("bf1")).toEqual([]);
  });

  test("P2's Ride the Wind lands the second unit there — and readies it, per the card", async () => {
    const game = await bothPresent();
    expect(game.state("rider")).toMatchObject({ isReady: true, isExhausted: false });
    expect(game.zoneOf("wind")).toBe("trash");
  });

  test("the roles are attacker P1 / defender P2 — never two attackers", async () => {
    const game = await bothPresent();
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("rider").combatRole).toBe("defender");
    expect([game.state("scout").combatRole, game.state("rider").combatRole]).not.toEqual(["attacker", "attacker"]);
  });

  test("the battlefield is not contested again by the late arrival — one contested status, one showdown", async () => {
    const game = await bothPresent();
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.gameState.battlefields.bf1?.contestedBy ?? P1).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("the combat is a 3-vs-3 trade; with nobody left the battlefield stays uncontrolled and nobody scores", async () => {
    const game = await bothPresent();
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("rider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBe(null);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });
});
