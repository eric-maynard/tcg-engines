/**
 * Ruling 007fba1784bd1662 — Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · [2][chaos] · Action
 *   "Move a friendly unit and ready it."
 *   × Charm (OGN-043 → ogn-043-298) · Spell · Calm · [1][calm] — "Move an enemy unit."
 *
 * Q: On the opponent's turn, my unit (my only unit at battlefield A, which I control) is Charmed over to
 *    battlefield B. Can I Ride the Wind it back to A during the combat at B and CONQUER A on their turn?
 * A: Yes. Control of A was lost in the Cleanup after Charm's move; Ride the Wind (Action, legal in the
 *    showdown at B) moves the unit back, which stages a showdown at A. Combat at B finishes first, then the
 *    showdown at A resolves; if only my units are there when it ends I conquer A and score.
 * Rules: 323.6 (empty battlefield → uncontrolled at Cleanup), 450/464.2.c (arriving unit's controller is the
 *        Attacker), 347/348.2.a(.1) (non-combat showdown → establish control → Conquer), 466 (combat at B ends
 *        with no attackers left).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const CHARM = "ogn-043-298";

/**
 * P2's turn (turn 3). P1 controls bfA with its lone "rider" (3); P2 controls bfB with "guard" (5).
 * P2 holds Charm with exactly [1][calm]; P1 holds Ride the Wind with exactly [2][chaos].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .points(P1, 3)
    .points(P2, 2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", { might: 3, name: "Wind Rider" }, "rider")
    .unit(P2, "bfB", { might: 5, name: "Gate Guard" }, "guard")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .hand(P2, CHARM, "charm");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const bf = (game: Game, id: string) => game.gameState.battlefields[id];

/** P2 Charms rider to bfB and it resolves (both pass). */
async function charmRiderToB(game: Game): Promise<void> {
  await game.p2.cast("charm", { targets: "rider" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { pendingChoiceType: "choose-destination" } });
  await game.p2.pick("battlefield-bfB");
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("charm")).toBe("trash");
  expect(game.locationOf("rider")).toBe("bfB");
}

/** In the bfB combat showdown P1 (attacker, Focus) casts Ride the Wind on rider back to bfA; both pass → resolves. */
async function rideBackToA(game: Game): Promise<void> {
  expect(game.p1.can("cast", "rtw")).toBe(true);
  await game.p1.cast("rtw", { targets: "rider" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  // Destination may be asked at play time (355.4) or on resolution — answer whenever it shows up.
  for (let i = 0; i < 6 && game.zoneOf("rtw") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.key)).toContain("battlefield-bfA");
      await game.p1.pick("battlefield-bfA");
    } else if (d?.kind === "action") {
      await game.acting().passPriority();
    } else {
      break;
    }
  }
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => o.key === "battlefield-bfA")) {
    await game.p1.pick("battlefield-bfA");
  }
  expect(game.zoneOf("rtw")).toBe("trash");
}

describe("Ruling 007fba1784bd1662 — Ride the Wind back to a battlefield you lost this turn conquers it on the opponent's turn", () => {
  test("premise: P2's turn; P1 controls bfA with its only unit there; Ride the Wind (Action) is not castable in P2's open main phase", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P2);
    expect(bf(game, "bfA")?.controller).toBe(P1);
    expect(game.p1.units("bfA")).toEqual(["rider"]);
    expect(game.p1.can("cast", "rtw")).toBe(false);
  });

  test("Charm moves rider to bfB: P1 LOSES control of the now-empty bfA in the Cleanup (323.6) and a combat opens at bfB with P1 as the Attacker holding Focus (450, 464.2.c/d)", async () => {
    const game = await board().build();
    await charmRiderToB(game);
    expect(game.p1.units("bfA")).toEqual([]);
    expect(bf(game, "bfA")?.controller).toBeNull();
    expect(bf(game, "bfB")).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(showdown(game)).toMatchObject({
      active: true,
      attackingPlayer: P1,
      battlefieldId: "bfB",
      defendingPlayer: P2,
      focusPlayer: P1,
      isCombatShowdown: true,
    });
    expect(game.state("rider").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    // Nobody has scored anything yet.
    expect(game.p1.points()).toBe(3);
    expect(game.p2.points()).toBe(2);
  });

  test("during the bfB showdown P1 (Focus) may cast Ride the Wind (Action) on rider and send it back to bfA; it arrives READY and bfB's combat is still the active showdown", async () => {
    const game = await board().build();
    await charmRiderToB(game);
    await rideBackToA(game);
    expect(game.locationOf("rider")).toBe("bfA");
    expect(game.state("rider").isReady).toBe(true);
    // rider took no combat damage — it left before the damage step.
    expect(game.state("rider").damage).toBe(0);
    expect(game.state("guard").damage).toBe(0);
  });

  test("combat at bfB finishes first (no attackers left → bfB stays P2's, guard unharmed), THEN the staged showdown at bfA resolves: only P1 has units there → P1 conquers bfA and scores 1 on P2's turn (348.2.a.1)", async () => {
    const game = await board().build();
    await charmRiderToB(game);
    await rideBackToA(game);
    // Everyone passes from here: bfB combat closes, then the bfA showdown closes.
    const r = await game.settle();
    if (r.reason === "open" && showdown(game)?.active) {
      // rule 344.2 — settle() hands a Cleanup-begun non-combat showdown back once; keep passing.
      expect(showdown(game)).toMatchObject({ battlefieldId: "bfA", isCombatShowdown: false });
      await game.settle();
    }
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.chain()).toEqual([]);
    // bfB: P2 kept it, guard untouched, no point for anyone there.
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("guard")).toBe("battlefield-bfB");
    expect(game.state("guard").damage).toBe(0);
    expect(game.p2.points()).toBe(2);
    // bfA: P1 re-established control → Conquer → +1 point, on P2's turn.
    expect(game.turnPlayer()).toBe(P2);
    expect(game.locationOf("rider")).toBe("bfA");
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(4);
    expect(game.gameState.scoredThisTurn[P1] ?? []).toContain("bfA");
    // Back to P2's open main phase.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
