/**
 * Ruling 09ec3087081c15e0 — Ride the Wind (OGN-173 → ogn-173-298) · Action spell · Chaos · [2]+[chaos]
 *     "Move a friendly unit and ready it."   (× Charm ogn-043-298 — "works similarly")
 *
 * Q: Can Ride the Wind move one of your units from battlefield A to battlefield B mid-showdown, during the
 *    OPPONENT's turn?
 * A: Yes. Nuances: this can conquer a battlefield on the opponent's turn; doing it twice (conquering both
 *    battlefields) at 6 points wins on their turn; and if you move into a battlefield where the opponent
 *    already has a unit (they contested first), THEIR unit is the attacker and yours the defender.
 * Rules: 344 (Action timing in showdowns), 446 (move), 465 (combat roles follow who contested), 467/471.1.b.1
 *        (Final Point needs every battlefield scored this turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

function showdown(game: Game) {
  return game.gameState.interaction?.showdownStack?.at(-1);
}

/**
 * Case A→B. P2's turn. P1's Runner holds bf1; bf2 is P2's but empty. P2's Raider attacks bf1 (combat showdown).
 * P1 has exactly [2]+[chaos] and 6 points (victory at 8).
 */
function boardAtoB() {
  return scenario()
    .active(P2)
    .points(P1, 6)
    .victoryScore(8)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder") // rule 190.4.a — bf2 is P2's only while a P2 unit holds it
    .unit(P1, "bf1", { might: 3, name: "Runner" }, "runner")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, RIDE_THE_WIND, "ride");
}

/** P2 attacks bf1 and passes Focus; P1 (with Focus, on P2's turn) Rides Runner bf1 → bf2; the spell resolves. */
async function rideRunnerToBf2(): Promise<Game> {
  const game = await boardAtoB().build();
  await game.p2.move("raider", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", focusPlayer: P2, isCombatShowdown: true });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.turnPlayer()).toBe(P2);
  expect(game.p1.can("cast", "ride")).toBe(true);
  // Destination is asked as the spell is finalized (pick: base | bf2) — answer bf2.
  await game.p1.cast("ride", { answers: ["bf2"], targets: "runner" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ride"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Ride the Wind resolves
  return game;
}

describe("Ruling 09ec3087081c15e0 — Ride the Wind moves a unit between battlefields mid-showdown on the opponent's turn", () => {
  test("mid-showdown on P2's turn, Ride the Wind moves Runner from bf1 to bf2 and readies it; bf2 becomes contested by P1", async () => {
    const game = await rideRunnerToBf2();
    expect(game.zoneOf("ride")).toBe("trash");
    expect(game.locationOf("runner")).toBe("bf2");
    expect(game.state("runner").isReady).toBe(true);
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    // The bf1 showdown is still the open one; P2 (its attacker) has Focus back.
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.turnPlayer()).toBe(P2);
  });

  test("this conquers bf2 DURING P2's turn: after the bf1 showdown closes, a showdown at bf2 runs and P1 scores 6 → 7 (P2 takes the vacated bf1)", async () => {
    const game = await rideRunnerToBf2();
    let stop = await game.settle(); // closes bf1 (Raider alone → P2 conquers), hands back the auto-begun bf2 showdown once
    if (stop.reason === "open" && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "showdown") {
      stop = await game.settle();
    }
    expect(game.turnPlayer()).toBe(P2);
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(7);
    expect(game.p2.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  /**
   * Nuances 2 + 3. P2's turn, two battlefields: bf1 uncontrolled & empty, bf2 P2's & empty. P1 (6 pts, win at 8) has
   * two 5-Might Runners in base and two Ride the Winds ([4] + 2 chaos). P2's 2-Might Raider moves to bf1 (P2 contests
   * it first → showdown). P1 rides R1 → bf2, then R2 → bf1 (into the Raider).
   */
  function boardDouble() {
    return scenario()
      .active(P2)
      .points(P1, 6)
      .victoryScore(8)
      .resources(P1, { energy: 4, power: { chaos: 2 } })
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 5, name: "Runner One" }, "r1")
      .unit(P1, "base", { might: 5, name: "Runner Two" }, "r2")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .hand(P1, RIDE_THE_WIND, "ride1")
      .hand(P1, RIDE_THE_WIND, "ride2");
  }

  async function doubleRide(): Promise<Game> {
    const game = await boardDouble().build();
    await game.p2.move("raider", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1" });
    await game.p2.passFocus();
    await game.p1.cast("ride1", { answers: ["bf2"], targets: "r1" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("r1")).toBe("bf2");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("ride2", { answers: ["bf1"], targets: "r2" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("r2")).toBe("bf1");
    return game;
  }

  test("moving into a battlefield the opponent contested first: P2's Raider is the ATTACKER and P1's ridden-in Runner the DEFENDER (465)", async () => {
    const game = await doubleRide();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2 });
    // Pass Focus around until the combat between Raider and Runner Two at bf1 is staged (roles assigned).
    for (let i = 0; i < 8 && game.zoneOf("raider") !== "trash" && game.state("raider").combatRole === null; i++) {
      await game.acting().passFocus();
    }
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("r2").combatRole).toBe("defender");
  });

  test("doing it twice and conquering BOTH battlefields at 6 points wins the game on the opponent's turn (every battlefield scored ⇒ Final Point allowed, 471.1.b.1)", async () => {
    const game = await doubleRide();
    for (let i = 0; i < 4 && !game.isOver(); i++) {
      await game.settle();
    }
    expect(game.zoneOf("raider")).toBe("trash"); // 2-Might attacker into a 5-Might defender
    expect(game.gameState.battlefields.bf1).toMatchObject({ controller: P1 });
    expect(game.gameState.battlefields.bf2).toMatchObject({ controller: P1 });
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.turnPlayer()).toBe(P2); // it never became P1's turn
  });
});
