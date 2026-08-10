/**
 * Ruling 0763e2fd879f27ba — Flash (OGS-011 → ogs-011-024) "[Reaction] Move up to 2 friendly units to base."
 *   × Ride the Wind (OGN-173 → ogn-173-298) "[Action] Move a friendly unit and ready it."
 *
 * Q: On the opponent's turn I Flash my unit out of my battlefield and Ride the Wind it back in. Did I lose
 *    control of the battlefield, and do I score?
 * A: It depends on whether control was completely lost first.
 *    (a) Flash out and Ride the Wind back in DURING THE SAME ONGOING SHOWDOWN: the showdown never ended, you
 *        never lost control, you remain the defender/controller — you do NOT score.
 *    (b) The opponent clears you out, the showdown ENDS and they take control; later you Ride the Wind a
 *        unit back in during an open state → a NEW showdown; win it and you Conquer → you score 1.
 * Rules: 347.2.a (a showdown ends only when all players pass in sequence), 346/347.1.b (focus passing),
 *        466.5 / 466.5.d (Establish Control ⇒ Conquer only if you did not already control it), 469.1, 188.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FLASH = "ogs-011-024";
const RIDE_THE_WIND = "ogn-173-298";

/**
 * P2's turn 3. P1 holds bf1 with Defender (4). P2 has Attacker (3) and a Scout (1) in base; bf2 is open.
 * P1 holds Flash ([2]) and Ride the Wind ([2][chaos]) with exactly enough for both.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 4, name: "Defender" }, "def")
    .unit(P2, "base", { might: 3, name: "Attacker" }, "atk")
    .unit(P2, "base", { might: 1, name: "Scout" }, "scout")
    .hand(P1, FLASH, "flash")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** P2 attacks bf1 and passes Focus; P1 Flashes the Defender home and the Flash chain resolves. */
async function flashedOutMidShowdown(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("atk", "bf1");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("flash", { targets: "def" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("def")).toBe("base");
  return game;
}

describe("Ruling 0763e2fd879f27ba — Flash out + Ride the Wind back: score only if control was actually lost", () => {
  test("(a) after the Flash resolves the showdown is STILL ongoing (only one player has passed since): bf1 is still contested and still controlled by P1; Focus passed to P2 (346)", async () => {
    const game = await flashedOutMidShowdown();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("(a) ruling 0763e2fd879f27ba — P2 passes, P1 Rides the Wind the Defender back into bf1 (readied) in the SAME showdown; combat then resolves, P1 wins and keeps bf1 — but scores NOTHING (never lost control ⇒ no Conquer)", async () => {
    const game = await flashedOutMidShowdown();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "rtw")).toBe(true);
    await game.p1.cast("rtw", { targets: "def" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    await game.p1.pick("battlefield-bf1");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ride the Wind resolves: Defender back at bf1, readied
    expect(game.state("def")).toMatchObject({ isReady: true, location: "bf1" });
    // Same showdown: still contested by P2, still P1's battlefield; Focus back with P2.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    await game.settle(); // everyone passes → combat: Defender 4 vs Attacker 3
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.state("def")).toMatchObject({ location: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) contrast — P1 does NOT come back: both pass, the showdown ends with only P2's unit there → P1 has completely lost bf1: P2 controls it and scored its Conquer", async () => {
    const game = await flashedOutMidShowdown();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test("(b) ruling 0763e2fd879f27ba — later that turn (P2 opens a showdown at bf2), P1 Rides the Wind the Defender into now-enemy bf1: a NEW showdown/combat is staged there; P2 (turn player) opens it, P1 wins it, CONQUERS bf1 and scores 1", async () => {
    const game = await flashedOutMidShowdown();
    await game.settle(); // showdown ends, P2 conquers bf1
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    // P2 walks the Scout onto open bf2 → a (non-combat) showdown where P1 will get Focus.
    await game.p2.move("scout", "bf2");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("rtw", { targets: "def" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    await game.p1.pick("battlefield-bf1");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ride the Wind resolves: Defender at bf1, readied
    expect(game.state("def")).toMatchObject({ isReady: true, location: "bf1" });
    // bf2 showdown ends (P2 takes bf2), then the turn player opens the brand-new showdown staged at
    // bf1 (464.1) and both players pass into combat: Defender 4 (attacking) vs Attacker 3 (defending).
    // Nobody has a play left, so one settle drives both showdowns to the end of the action phase.
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p2.points()).toBe(2);
    // The bf1 showdown really was a NEW one, staged by P1 while P2 held the battlefield.
    expect(game.gameState.battlefields.bf1).toMatchObject({
      controllerAtShowdownStart: P2,
      showdownComplete: true,
      stagedBy: P1,
    });
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.state("def")).toMatchObject({ location: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    // P1 re-CONQUERED a battlefield it had completely lost → scores, even on the opponent's turn.
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
