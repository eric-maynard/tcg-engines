/**
 * Ruling 80c2dd98d21e02bc — Ride the Wind (OGN-173 → ogn-173-298) · Action · 2+[chaos] "Move a friendly unit and ready it."
 *   × Glorious Executioner (SFD-185 → sfd-185-221, Legend · Draven) "When you win a combat, draw 1. (You win if only your units remain
 *     after combat.)"
 *   × Draven, Showboat (OGN-028 → ogn-028-298) · 3 Might "My Might is increased by your points." (the "Draven unit")
 *
 * Q: Opponent moves onto an open battlefield; I Ride the Wind my Draven in to defend. If I win that combat, does my Draven legend
 *    draw me a card?
 * A: Yes. Combat doesn't end just because it started as a walk onto an empty field: after Ride the Wind a combat follows, and if
 *    only my units remain after combat cleanup I have won it → Glorious Executioner triggers and I draw 1 (Draven must still be
 *    there when combat concludes).
 * Rules: 459–466 (showdown → combat; winner = only your units remain after cleanup), 461 (cleanup/recall), legend trigger.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const GLORIOUS_EXECUTIONER = "sfd-185-221";
const DRAVEN_SHOWBOAT = "ogn-028-298";

/** P2's turn. bf1 open. P2: Scout (2) in base. P1: legend Glorious Executioner, Draven (3) in base, Ride the Wind + 2+[chaos]; deck top d1. */
function board(scoutMight = 2) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: null })
    .legend(P1, GLORIOUS_EXECUTIONER, "legend")
    .unit(P2, "base", { might: scoutMight, name: "Scout" }, "scout")
    .unit(P1, "base", DRAVEN_SHOWBOAT, "draven")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

function stack(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);
}

/** Scout walks onto open bf1; P2 passes Focus; P1 Rides Draven in; the spell resolves. */
async function scoutInDravenRidesIn(scoutMight = 2): Promise<Game> {
  const game = await board(scoutMight).build();
  await game.p2.move("scout", "bf1");
  expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: false });
  expect(game.p2.points()).toBe(0);
  await game.p2.passFocus();
  expect(game.p1.can("cast", "rtw")).toBe(true);
  await game.p1.cast("rtw", { targets: "draven" });
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("battlefield-bf1");
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf("draven")).toBe("bf1");
  expect(game.state("draven").isReady).toBe(true);
  return game;
}

describe("Ruling 80c2dd98d21e02bc — defending via Ride the Wind and winning the combat triggers Glorious Executioner's draw", () => {
  test("after Draven rides in, a COMBAT follows at bf1 (P2 attacking, Draven defending) — the walk-in did not just end with P2 scoring", async () => {
    const game = await scoutInDravenRidesIn();
    for (let i = 0; i < 6 && !(stack(game)[0]?.isCombatShowdown ?? false); i++) {
      await game.acting().pass();
    }
    expect(stack(game)[0]).toMatchObject({ attackingPlayer: P2, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("draven").combatRole).toBe("defender");
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.p2.points()).toBe(0);
    expect(game.p1.hand()).toEqual([]); // nothing drawn yet
  });

  test("Draven (3) kills the Scout (2) and survives: only P1's units remain → P1 WON the combat → the legend triggers and P1 draws 1 (d1); P1 also takes bf1", async () => {
    const game = await scoutInDravenRidesIn();
    await game.settle();
    expect(stack(game)).toEqual([]);
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("draven")).toBe("battlefield-bf1");
    expect(game.p1.hand()).toEqual(["d1"]); // Glorious Executioner: "When you win a combat, draw 1"
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: if Draven LOSES (a 6-Might attacker kills him), P1 did not win the combat — no draw; P2 conquers bf1", async () => {
    const game = await scoutInDravenRidesIn(6);
    await game.settle();
    expect(game.zoneOf("draven")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });
});
