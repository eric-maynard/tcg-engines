/**
 * Ruling c443e8ef0ba78994 — Ride the Wind (OGN-173 → ogn-173-298) · Action [2][chaos]
 *   "Move a friendly unit and ready it."
 *
 * Q: Both players Ride the Wind out of Battlefield A and into Battlefield B during the same showdown. How
 *    does that resolve, and who can conquer what?
 * A: The showdown at A finishes first — with nobody left there, so no conquer. There is a window in which
 *    no unit is an attacker or a defender. Only then does the showdown at B begin, and the player who moved
 *    in SECOND is its defender.
 * Rules: 323.12/323.13 (a staged showdown waits for the ongoing one to close), 348.2.a (a showdown with no
 *        units closes with no control established), 190.3.a (the first arrival applies Contested = attacker).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

async function drain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    await game.acting().pass();
  }
}

/** P1's turn: P1's 4-Might Attacker walks into P2's 5-Might Defender at bfA. bfB is empty and uncontrolled.
 *  Both players hold a Ride the Wind and [2][chaos]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfB", { controller: null })
    .unit(P2, "bfA", { might: 5, name: "Defender" }, "def")
    .unit(P1, "base", { might: 4, name: "Attacker" }, "atk")
    .hand(P1, RIDE_THE_WIND, "rtwA")
    .hand(P2, RIDE_THE_WIND, "rtwB");
}

/** Open the combat at bfA, then P2 rides out, then P1 rides out. */
async function bothLeave(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("atk", "bfA");
  expect(game.state("atk").combatRole).toBe("attacker");
  expect(game.state("def").combatRole).toBe("defender");
  await game.p1.passFocus();
  await game.p2.cast("rtwB", { answers: ["bfB"], targets: "def" });
  await drain(game);
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || (d.seat === P1 && game.p1.can("cast", "rtwA"))) {
      break;
    }
    await game.seat(d.seat).pass();
  }
  await game.p1.cast("rtwA", { answers: ["bfB"], targets: "atk" });
  await drain(game);
  return game;
}

describe("Ruling c443e8ef0ba78994 — the emptied showdown at A closes first (no conquer), then B's begins", () => {
  test("ruling: with both units gone, NOBODY is an attacker or a defender — the in-between window", async () => {
    const game = await bothLeave();
    expect(game.locationOf("def")).toBe("bfB");
    expect(game.locationOf("atk")).toBe("bfB");
    expect(game.state("atk").combatRole).toBeNull();
    expect(game.state("def").combatRole).toBeNull();
  });

  test("ruling: the showdown at bfA is still the running one; bfB is only Contested (staged), not yet a showdown", async () => {
    const game = await bothLeave();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, showdownComplete: false });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P2, showdownComplete: false });
  });

  test("ruling: bfA closes with no units present, so nobody conquers it — control simply lapses and no point is scored", async () => {
    const game = await bothLeave();
    await game.acting().pass();
    await game.acting().pass(); // both pass Focus at the emptied bfA
    expect(game.gameState.battlefields.bfA?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("ruling: only THEN does bfB's showdown begin — and the player who arrived second (P1) is its defender", async () => {
    const game = await bothLeave();
    await game.acting().pass();
    await game.acting().pass();
    expect(game.state("def").combatRole).toBe("attacker"); // P2 arrived first and applied Contested
    expect(game.state("atk").combatRole).toBe("defender"); // P1 arrived second
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("ruling: bfB's combat then resolves on its own terms — 5 beats 4, P2 conquers bfB and scores there, not at bfA", async () => {
    const game = await bothLeave();
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("def")).toBe("battlefield-bfB");
    expect(game.gameState.battlefields.bfA?.controller).toBeNull();
    expect(game.gameState.battlefields.bfB?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
