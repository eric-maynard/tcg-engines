/**
 * Ruling 655aecf196a0bc25 — Charm (OGN-043 → ogn-043-298) · spell · Calm · [1][calm] — "Move an enemy unit."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Action · Chaos · [2][chaos] — "Move a friendly unit and ready it."
 *
 * Q: Opponent Charms my unit onto their battlefield; I Ride the Wind it back to my original battlefield. Do I score?
 * A: Yes (if I no longer control it when that showdown begins and haven't scored it this turn). Charm → combat at
 *    their battlefield B and I lose control of A; during that showdown I Ride the Wind back to A, which STAGES a
 *    showdown at A; when B's combat ends and nobody acts, A's showdown begins; if nobody acts, I conquer A: +1 point.
 * Rules: 190.4.c (no units → lose control at cleanup), 459–464 (staged showdowns run one at a time), 444/630s
 *        (conquer scoring), Action timing (playable in showdowns).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P2's turn. P1 controls bfA with Runner (3) alone; P2 controls bfB with Guard (4). P2: Charm + [1][calm]. P1: Ride the Wind + [2][chaos]. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", { might: 3, name: "Runner" }, "runner")
    .unit(P2, "bfB", { might: 4, name: "Guard" }, "guard")
    .hand(P2, CHARM, "charm")
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .hand(P1, RIDE_THE_WIND, "rtw")
    .resources(P1, { energy: 2, power: { chaos: 1 } });
}

function openShowdown(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).find((s) => s.active);
}

/** P2 Charms Runner to bfB and it resolves: combat opens at bfB. */
async function charmedToB(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.points()).toBe(0);
  await game.p2.cast("charm", { targets: "runner" });
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("battlefield-bfB");
  }
  await game.p2.passPriority();
  await game.p1.passPriority(); // Charm resolves
  expect(game.zoneOf("charm")).toBe("trash");
  return game;
}

/** …then, holding Focus in that showdown, P1 Rides the Wind Runner back to bfA and the spell resolves. */
async function rideBackToA(game: Game): Promise<void> {
  if (game.actingSeat() === P2) {
    await game.p2.passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "rtw")).toBe(true);
  await game.p1.cast("rtw", { targets: "runner" });
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("battlefield-bfA");
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  await game.acting().passPriority();
  await game.acting().passPriority(); // Ride the Wind resolves
  expect(game.zoneOf("rtw")).toBe("trash");
}

describe("Ruling 655aecf196a0bc25 — Charmed away, Ride the Wind back: the staged showdown at the original battlefield scores a conquer", () => {
  test("Charm resolving opens COMBAT at bfB (Runner attacking Guard) and P1, with no units left at bfA, has LOST control of bfA", async () => {
    const game = await charmedToB();
    expect(game.locationOf("runner")).toBe("bfB");
    expect(openShowdown(game)).toMatchObject({ battlefieldId: "bfB", isCombatShowdown: true, attackingPlayer: P1 });
    expect(game.state("runner").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bfA?.controller).toBe(null);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("during bfB's showdown P1 plays Ride the Wind back to bfA: Runner leaves (readied), bfA becomes contested/staged by P1 — but bfB's showdown is still the open one and nothing is scored yet", async () => {
    const game = await charmedToB();
    await rideBackToA(game);
    expect(game.locationOf("runner")).toBe("bfA");
    expect(game.state("runner").isReady).toBe(true);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(openShowdown(game)).toMatchObject({ battlefieldId: "bfB" }); // A's showdown is only staged
    expect(game.p1.points()).toBe(0);
    // Players still get to act in the bfB showdown before anything else happens.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("when bfB's combat ends with nobody acting, the STAGED showdown at bfA begins (P1 did not control it at that moment); nobody acts → P1 conquers bfA and scores exactly 1 point", async () => {
    const game = await charmedToB();
    await rideBackToA(game);
    // Close out bfB: both pass focus.
    for (let i = 0; i < 4 && openShowdown(game)?.battlefieldId === "bfB"; i++) {
      await game.acting().passFocus();
    }
    const atA = openShowdown(game);
    expect(atA).toMatchObject({ battlefieldId: "bfA", isCombatShowdown: false });
    expect(game.gameState.battlefields.bfA?.controller).toBe(null); // "you must not control A when the showdown begins" ✔
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" }); // another window to act
    // Nobody acts at bfA either: both pass focus.
    for (let i = 0; i < 4 && openShowdown(game) !== undefined; i++) {
      await game.acting().passFocus();
    }
    await game.settle();
    expect(openShowdown(game)).toBeUndefined();
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P2);
    expect(game.zoneOf("guard")).toBe("battlefield-bfB");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
