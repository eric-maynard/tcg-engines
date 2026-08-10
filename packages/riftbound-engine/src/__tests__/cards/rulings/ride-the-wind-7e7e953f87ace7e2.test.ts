/**
 * Ruling 7e7e953f87ace7e2 — Ride the Wind (OGN-173 → ogn-173-298) · Action · [2]+[chaos]
 *     "Move a friendly unit and ready it."
 *   × Ember Monk (OGN-167 → ogn-167-298, 4 Might) as the ridden unit. (Hidden Blade OGN-213 is only mentioned as
 *     an aside in the source scenario.)
 *
 * Q: Can you score the 8th (final) point with a Ride the Wind conquer if you haven't scored both battlefields this turn?
 * A: No. A conquer only awards the Final Point if you scored every battlefield this turn; otherwise you draw 1
 *    instead. If you can then conquer the other battlefield afterwards, THAT conquer scores the final point.
 * Rules: 471.1.b.1 (Final Point via conquer requires all battlefields scored this turn, else draw), 466 (conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const EMBER_MONK = "ogn-167-298";

/**
 * P1's turn, first to 8, P1 on 7. bf1: P2's, held by a 1-Might Speedbump. bf2: open. P1: Ember Monk (4) and a
 * vanilla Bruiser (5) in base, Ride the Wind in hand with exactly [2]+[chaos].
 */
function board() {
  return scenario()
    .victoryScore(8)
    .points(P1, 7)
    .points(P2, 3)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 1, name: "Speedbump" }, "def")
    .unit(P1, "base", EMBER_MONK, "monk")
    .unit(P1, "base", { might: 5, name: "Bruiser" }, "bruiser")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Ride the Wind on the Monk → bf2 (open); the spell resolves, the non-combat showdown passes, P1 conquers bf2. */
async function rideToOpenBattlefield(): Promise<{ game: Game; handBefore: number }> {
  const game = await board().build();
  await game.p1.cast("rtw", { targets: "monk" });
  // The destination is P1's choice — surfaced as a pick for P1.
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  const d = game.decision();
  expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toContain("battlefield-bf2");
  await game.p1.pick("battlefield-bf2");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  const handBefore = game.p1.hand().length; // rtw has left the hand
  await game.settle(); // spell resolves → Monk at bf2, showdown opens (handed back once)
  expect(game.locationOf("monk")).toBe("bf2");
  expect(game.state("monk").isReady).toBe(true);
  await game.settle(); // both pass focus → P1 conquers bf2
  expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
  return { game, handBefore };
}

describe("Ruling 7e7e953f87ace7e2 — a Ride the Wind conquer at 7/8 without every battlefield scored draws instead of winning", () => {
  test("conquering open bf2 via Ride the Wind at 7 points: bf1 was not scored this turn ⇒ NO 8th point, P1 draws 1 instead, game continues", async () => {
    const { game, handBefore } = await rideToOpenBattlefield();
    expect(game.gameState.conqueredThisTurn?.[P1]).toEqual(["bf2"]);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("…then conquering bf1 as well (Bruiser 5 beats the Speedbump) — now every battlefield is scored this turn ⇒ that conquer awards the final point: P1 wins 8–3", async () => {
    const { game } = await rideToOpenBattlefield();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
