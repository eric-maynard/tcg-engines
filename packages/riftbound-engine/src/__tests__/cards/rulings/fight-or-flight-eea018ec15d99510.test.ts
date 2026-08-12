/**
 * Ruling eea018ec15d99510 — Fight or Flight (OGN-168 → ogn-168-298) · [Hidden] [Action] spell · [2]
 *   "Move a unit from a battlefield to its base."
 *   × Lee Sin, Centered (OGN-151 → ogn-151-298) · 6 [Might]
 *
 * Q: If Fight or Flight moves a READY Lee Sin, does he become exhausted?
 * A: No. Only a STANDARD move has "exhaust the unit" as its cost; every other move leaves the unit's state alone
 *    unless it says otherwise. He comes home ready and can still standard-move out again to conquer.
 * Rules: 344/345 (moves; the standard move's exhaust cost), 470 (one score per battlefield per turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const LEE_SIN = "ogn-151-298";

/** P1's turn. Lee Sin stands READY at bf1 (P1's); bf2 is empty and uncontrolled. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", LEE_SIN, "leesin")
    .hand(P1, FIGHT_OR_FLIGHT, "flight")
    .resources(P1, { energy: 2 });
}

async function flown(): Promise<Game> {
  const game = await board().build();
  expect(game.state("leesin").isReady).toBe(true);
  await game.p1.cast("flight", { targets: "leesin" });
  await game.settle();
  return game;
}

describe("Ruling eea018ec15d99510 — Fight or Flight brings Lee Sin home READY", () => {
  test("he lands in base and is still ready — the spell's move costs no exhaust", async () => {
    const game = await flown();
    expect(game.locationOf("leesin")).toBe("base");
    expect(game.state("leesin")).toMatchObject({ isExhausted: false, isReady: true });
    expect(game.zoneOf("flight")).toBe("trash");
  });

  test("an ALREADY EXHAUSTED Lee Sin also keeps his state — the move never readies either", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", LEE_SIN, "leesin", { exhausted: true })
      .hand(P1, FIGHT_OR_FLIGHT, "flight")
      .resources(P1, { energy: 2 })
      .build();
    await game.p1.cast("flight", { targets: "leesin" });
    await game.settle();
    expect(game.locationOf("leesin")).toBe("base");
    expect(game.state("leesin").isExhausted).toBe(true);
  });

  test("nuance: because he is still ready he can standard-move out again and conquer the other battlefield", async () => {
    const game = await flown();
    expect(game.p1.legal().filter((o) => o.verb === "move").map((o) => o.key)).toEqual(["standardMove:to:bf1", "standardMove:to:bf2"]);
    await game.p1.move("leesin", "bf2");
    await game.settle();
    expect(game.state("leesin").isExhausted).toBe(true); // THIS move is the standard one, and it costs the exhaust
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("a battlefield already scored this turn gives no second point (rule 470)", async () => {
    const game = await flown();
    await game.p1.move("leesin", "bf2");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
  });
});
