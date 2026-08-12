/**
 * Ruling bba0a3b7fddc7831 — Ride the Wind (OGN-173 → ogn-173-298) · Action [2][chaos]
 *   "Move a friendly unit and ready it."
 *
 * Q: A defending unit rides to another battlefield and then rides back during the same combat. Does it
 *    become an attacker?
 * A: No. Leaving strips the defender designation, but the battlefield it arrives at only becomes Contested —
 *    its combat is STAGED, not started, because the first combat is still running. So the unit is neither
 *    attacker nor defender while it is away. Riding back to the original battlefield makes it a defender
 *    again. (Attack/defend triggers fire only the FIRST time a unit gains the designation in a combat.)
 * Rules: 190.3.a/450 (arrival applies Contested), 323.13 (a staged combat waits for the ongoing one),
 *        464.2.c.3.a (roles are handed out when a combat begins / a unit joins one), 383.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/** Drain the chain by passing priority. */
async function drain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    await game.acting().pass();
  }
}

/** P2's turn: P1 defends bf1 with a Guard against P2's Raider; P2 also holds bf2 with a Sentinel.
 *  P1 has two Ride the Winds and [4][chaos][chaos]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 4, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "bf2", { might: 5, name: "Sentinel" }, "sentinel")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, RIDE_THE_WIND, "rtw1")
    .hand(P1, RIDE_THE_WIND, "rtw2");
}

/** P2 attacks bf1; P1 takes Focus and rides the Guard away to bf2. */
async function rideAway(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.state("guard").combatRole).toBe("defender");
  expect(game.state("raider").combatRole).toBe("attacker");
  await game.p2.passFocus();
  await game.p1.cast("rtw1", { answers: ["bf2"], targets: "guard" });
  await drain(game);
  return game;
}

/** …and then rides it back to bf1. */
async function rideBack(game: Game): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || (d.seat === P1 && game.p1.can("cast", "rtw2"))) {
      break;
    }
    await game.seat(d.seat).pass();
  }
  await game.p1.cast("rtw2", { answers: ["bf1"], targets: "guard" });
  await drain(game);
}

describe("Ruling bba0a3b7fddc7831 — a defender that rides away is NEITHER attacker nor defender until it comes back", () => {
  test("ruling: after the move the Guard is at bf2 with NO combat designation at all", async () => {
    const game = await rideAway();
    expect(game.locationOf("guard")).toBe("bf2");
    expect(game.state("guard").combatRole).toBeNull();
  });

  test("ruling: bf2 is merely Contested — its combat is staged, not started, because bf1's combat is ongoing", async () => {
    const game = await rideAway();
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1, showdownComplete: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" }); // still the bf1 showdown
    expect(game.state("sentinel").combatRole).toBeNull(); // nobody has a role at bf2 yet
  });

  test("ruling: the Guard did not become an attacker at bf2 even though enemy units are there", async () => {
    const game = await rideAway();
    expect(game.state("guard").combatRole).not.toBe("attacker");
  });

  test("ruling: riding back to bf1 makes it a DEFENDER again", async () => {
    const game = await rideAway();
    await rideBack(game);
    expect(game.locationOf("guard")).toBe("bf1");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.violations()).toEqual([]);
  });

  test("ruling: the round trip resolves as a normal defence — the returned Guard fights as a defender and loses to the bigger Raider", async () => {
    const game = await rideAway();
    await rideBack(game);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash"); // 3 defending Might vs 4
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // the attacker conquered it
    expect(game.locationOf("sentinel")).toBe("bf2"); // bf2 never opened a combat
  });
});
