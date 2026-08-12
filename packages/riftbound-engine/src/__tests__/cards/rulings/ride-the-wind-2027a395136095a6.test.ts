/**
 * Ruling 2027a395136095a6 — Ride the Wind (OGN-173 → ogn-173-298) · [2][chaos] [Action]
 *   "Move a friendly unit and ready it."
 *
 * Q: Ride the Wind cast during a showdown, moving a unit to a battlefield where I ALREADY have units
 *    fighting — does the moved unit join the current combat, or stage a second showdown?
 * A: It joins the current combat. Nothing is staged when you move into a battlefield where you already
 *    have units in the running combat: the arrival is simply an extra unit on your side of it.
 *    (Only moving to a battlefield you were NOT contesting stages a new showdown/combat.)
 * Rules: 323.8 (a showdown is staged at a battlefield you newly contest), 344.1 (arrivals join a showdown
 *        already running there), 460.2 (all units at the battlefield contribute Might to the combat).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

const stack = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);

/** P1's turn. P2 holds bf1 with a 5-Might Sentry; P1's Scout (2) attacks it and a Reserve (4) waits in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 5, name: "Sentry" }, "sentry")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .unit(P1, "base", { might: 4, name: "Reserve" }, "reserve", { exhausted: true })
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Scout attacks bf1 (combat showdown); P1 then rides the exhausted Reserve into the same bf1. */
async function rideIntoTheFight(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  expect(stack(game)).toHaveLength(1);
  expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: true });
  await game.p1.cast("rtw", { targets: "reserve" });
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("battlefield-bf1");
  }
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("rtw")).toBe("trash");
  return game;
}

describe("Ruling 2027a395136095a6 — riding into a battlefield where you are already fighting joins that combat", () => {
  test("ruling: the moved unit lands in the running combat — still exactly ONE showdown, nothing new staged", async () => {
    const game = await rideIntoTheFight();
    expect(game.locationOf("reserve")).toBe("bf1");
    expect(stack(game)).toHaveLength(1);
    expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false });
    expect(game.state("reserve").isReady).toBe(true); // "…and ready it"
  });

  test("ruling: the arrival is an attacker in that same combat and its Might counts", async () => {
    const game = await rideIntoTheFight();
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("reserve").combatRole).toBe("attacker");
    await game.settle();
    // 2 + 4 = 6 attacking Might vs the 5-Might Sentry: the Sentry dies and P1 conquers bf1.
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: riding to a battlefield you were NOT contesting stages a second showdown instead of joining", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.p1.cast("rtw", { targets: "reserve" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bf2");
    }
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("reserve")).toBe("bf2");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1 });
    expect(stack(game)).toHaveLength(1); // the bf2 showdown is only STAGED while bf1 runs
    expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1" });
  });
});
