/**
 * Ruling 97da343b1be0724a — Ride the Wind (OGN-173 → ogn-173-298) × Challenge (OGN-128 → ogn-128-298)
 *
 *   Ride the Wind — Action 2+[chaos]: "Move a friendly unit and ready it."
 *   Challenge — Action 2+[body]: "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *
 * Q: I start a showdown at battlefield A (my 1 unit vs their 1 unit). For their action they Ride the Wind their unit to
 *    battlefield B. Can I still play Challenge during the showdown at A even though their unit is no longer there?
 * A: Yes. Once their chain resolves and Focus comes to you, you may play the [Action] Challenge; during a showdown you may
 *    target units at either battlefield — your unit at A and their unit now at B.
 * Rules: 341/344 (Focus & playing Actions in a showdown), 355 (targeting has no "this battlefield" restriction unless printed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const CHALLENGE = "ogn-128-298";

/** P1's turn. bfA (P2's) holds P2's Duelist (3); bfB is P2's and empty. P1's Attacker (4) in base with Challenge; P2 holds Ride the Wind. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Attacker" }, "attacker")
    .unit(P2, "bfA", { might: 3, name: "Duelist" }, "duelist")
    .hand(P1, CHALLENGE, "challenge")
    .hand(P2, RIDE_THE_WIND, "rtw");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1 attacks bfA; P1 passes Focus; P2 Rides the Wind the Duelist to bfB; the chain resolves. */
async function attackThenTheyRideAway(game: Game): Promise<void> {
  await game.p1.move("attacker", "bfA");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfA", isCombatShowdown: true });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("rtw", { targets: "duelist" });
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("battlefield-bfB");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["rtw"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Ride the Wind resolves
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf("duelist")).toBe("bfB");
  expect(game.state("duelist").isReady).toBe(true);
}

describe("Ruling 97da343b1be0724a — Challenge during the showdown may reach the unit that Rode the Wind to the other battlefield", () => {
  test("after their Ride the Wind resolves the showdown at A is still open and Focus comes back to P1", async () => {
    const game = await board().build();
    await attackThenTheyRideAway(game);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfA" });
    for (let i = 0; i < 3 && game.actingSeat() !== P1; i++) {
      await game.acting().passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "challenge")).toBe(true);
  });

  test("Challenge is legal with my Attacker at A and their Duelist at B as the pair; it resolves: Duelist (3) takes 4 and dies, Attacker takes 3 and lives", async () => {
    const game = await board().build();
    await attackThenTheyRideAway(game);
    for (let i = 0; i < 3 && game.actingSeat() !== P1; i++) {
      await game.acting().passFocus();
    }
    const pairs = game.p1.option("cast", "challenge")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(pairs).toContainEqual(["attacker", "duelist"]);
    await game.p1.cast("challenge", { targets: ["attacker", "duelist"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Challenge resolves
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("duelist")).toBe("trash");
    expect(game.state("attacker")).toMatchObject({ damage: 3, zone: "battlefield-bfA" });
  });

  test("the showdown at A then closes with P1 alone there: P1 conquers bfA", async () => {
    const game = await board().build();
    await attackThenTheyRideAway(game);
    for (let i = 0; i < 3 && game.actingSeat() !== P1; i++) {
      await game.acting().passFocus();
    }
    await game.p1.cast("challenge", { targets: ["attacker", "duelist"] });
    await game.settle();
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
