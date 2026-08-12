/**
 * Ruling 3362cfda4699aff6 — Ride the Wind (OGN-173 → ogn-173-298) · Action · Chaos · [2][chaos]
 *     "Move a friendly unit and ready it."
 *
 * Q: Can I score on my opponent's turn by Riding the Wind to a DIFFERENT open battlefield during a showdown?
 * A: Yes. The unit arrives at the other battlefield while the first showdown is still running; that first
 *    showdown finishes, then the showdown staged at the new battlefield begins, and with nobody there to
 *    contest it my unit establishes control — a Conquer, scored on their turn. It is a second, separate
 *    showdown, and it is an ARRIVAL at an open battlefield, so there is nobody to attack.
 * Rules: 461/323.8 (a showdown is staged at each battlefield Contested was applied to and runs after the
 *        current one), 348.2.a (a non-combat showdown closes by establishing control ⇒ Conquer),
 *        471.2 (each battlefield scores once per turn, on either player's turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/**
 * P2's turn (turn 3). P1 holds bf1 with a 3-Might Guard and has a Runner in base plus Ride the Wind and
 * exactly [2][chaos]. bf2 is open. P2 attacks bf1 with a 2-Might Raider.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .victoryScore(8)
    .points(P1, 2)
    .points(P2, 2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 2, name: "Runner" }, "runner")
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Pass Focus/priority for whoever holds it until the open main phase. */
async function drive(game: Game): Promise<void> {
  for (let i = 0; i < 16; i++) {
    await game.settle();
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main" || !d.passKey) {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

/** P2 attacks bf1; during that showdown P1 sends the Runner to the OPEN bf2 with Ride the Wind. */
async function rideToTheOtherBattlefield(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.state("guard").combatRole).toBe("defender");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("rtw", { targets: "runner" });
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("battlefield-bf2");
  }
  return game;
}

describe("Ruling 3362cfda4699aff6 — riding to a different open battlefield stages a second showdown that scores on the opponent's turn", () => {
  test("the Runner arrives at the open bf2 while the bf1 combat is still live — and it is nobody's attacker there", async () => {
    const game = await rideToTheOtherBattlefield();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ride the Wind resolves
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("runner")).toBe("bf2");
    expect(game.state("runner")).toMatchObject({ combatRole: null, isReady: true });
    expect(game.state("guard").combatRole).toBe("defender"); // the bf1 combat has not gone anywhere
  });

  test("the bf1 combat finishes first, then bf2's showdown runs: P1 conquers bf2 and scores on P2's turn (2 → 3)", async () => {
    const game = await rideToTheOtherBattlefield();
    await drive(game);
    expect(game.zoneOf("raider")).toBe("trash"); // 3 vs 2 at bf1
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(game.locationOf("runner")).toBe("bf2");
    expect(game.p1.points()).toBe(3); // exactly one new point: the bf2 conquer
    expect(game.p2.points()).toBe(2);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("bf1 was defended, not conquered — holding what you already control scores nothing here", async () => {
    const game = await rideToTheOtherBattlefield();
    await drive(game);
    expect(game.p1.points()).toBe(3);
    expect(game.p1.units("bf1")).toEqual(["guard"]);
  });
});
