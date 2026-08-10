/**
 * Ruling 1268cccac9367694 — Void Seeker (OGN-024 → ogn-024-298) · Action spell · Fury · [3]+[fury]
 *     "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Action spell · Chaos · [2]+[chaos] · "Move a friendly unit and ready it."
 *
 * Q: If all units are removed from a battlefield during a showdown (both players Void Seeker each other's
 *    only unit), does the showdown continue?
 * A: Yes. Players keep Focus and may continue to play actions/reactions (e.g. Ride the Wind) in the same
 *    showdown; it only ends when both pass consecutively on an empty chain.
 * Rules: 344–345 (showdown lasts until all relevant players pass in a row with an empty chain), 465.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const RIDE_THE_WIND = "ogn-173-298";

/**
 * P1's turn. P2's 3-Might Defender holds bf1. P1: 3-Might Attacker + 2-Might Reserve in base, Void Seeker +
 * Ride the Wind in hand with exactly [5] + fury + chaos. P2: Void Seeker with exactly [3] + fury.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { chaos: 1, fury: 1 } })
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Defender" }, "def")
    .unit(P1, "base", { might: 3, name: "Attacker" }, "atk")
    .unit(P1, "base", { might: 2, name: "Reserve" }, "res")
    .hand(P1, VOID_SEEKER, "vs1")
    .hand(P1, RIDE_THE_WIND, "ride")
    .hand(P2, VOID_SEEKER, "vs2");
}

function showdown(game: Game) {
  return game.gameState.interaction?.showdownStack?.at(-1);
}

/** Attacker moves in (combat showdown at bf1); P1 Void Seekers the Defender, then P2 Void Seekers the Attacker. */
async function emptyTheBattlefield(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("atk", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true, focusPlayer: P1 });
  // P1 (Focus) kills the Defender.
  await game.p1.cast("vs1", { targets: "def" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("def")).toBe("trash");
  // Focus passes to P2, who kills the Attacker.
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("vs2", { targets: "atk" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("atk")).toBe("trash");
  return game;
}

describe("Ruling 1268cccac9367694 — a showdown continues after every unit at the battlefield is removed", () => {
  test("both only-units Void Seekered away: bf1 is empty, yet the showdown is still ACTIVE and P1 holds Focus with an action menu (not auto-ended)", async () => {
    const game = await emptyTheBattlefield();
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.legal().map((o) => o.verb)).toContain("passFocus");
    // Each Void Seeker also drew 1 for its caster.
    expect(game.zoneOf("vs1")).toBe("trash");
    expect(game.zoneOf("vs2")).toBe("trash");
  });

  test("players can keep playing actions in that same showdown — P1 casts Ride the Wind, moving Reserve from base into the empty bf1 and readying it", async () => {
    const game = await emptyTheBattlefield();
    expect(game.p1.can("cast", "ride")).toBe(true);
    await game.p1.cast("ride", { targets: "res", answers: ["bf1"] });
    let stop = await game.settle();
    if (stop.reason === "unanswered" && game.decision()?.seat === P1) {
      await game.p1.pick("bf1");
      stop = await game.settle();
    }
    expect(game.zoneOf("ride")).toBe("trash");
    expect(game.locationOf("res")).toBe("bf1");
    expect(game.state("res").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("the showdown ends only when both players pass in a row on an empty chain — then play returns to P1's open main phase", async () => {
    const game = await emptyTheBattlefield();
    await game.p1.passFocus();
    // One pass is not enough: P2 now has Focus in the still-open showdown.
    expect(showdown(game)).toMatchObject({ active: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    await game.settle();
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bf1?.contested ?? false).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
