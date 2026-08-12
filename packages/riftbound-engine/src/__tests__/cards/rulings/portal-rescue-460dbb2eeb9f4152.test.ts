/**
 * Ruling 460dbb2eeb9f4152 — Portal Rescue (OGN-102 → ogn-102-298) · Spell · Mind · [3][mind] · [Action]
 *   "Banish a friendly unit, then its owner plays it to their base, ignoring its cost."
 *
 * Q: Does a combat showdown end the moment all defending units are removed, or does it run until both players
 *    pass?
 * A: It runs on. A showdown ends only when both players pass FOCUS in a row with the chain empty. Removing the
 *    last defender — with Portal Rescue or anything else — does not end it; the defender still gets Focus and
 *    may keep playing Actions.
 * Rules: 460/463 (a showdown closes on two consecutive Focus passes with an empty chain),
 *        190.4.b (control at the battlefield is frozen while the showdown runs),
 *        466.5 (control is settled only when the combat resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PORTAL_RESCUE = "ogn-102-298";
const unit = (might: number, name: string) => ({ cardType: "unit", energyCost: 1, might, name }) as const;

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1 attacks P2's bf1 with three units against a single defender; P2 has Portal Rescue and the Focus. */
async function threeOnOne(): Promise<Game> {
  const game = await scenario()
    .resources(P2, { energy: 6, power: { mind: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", unit(3, "Defender"), "def")
    .unit(P1, "base", unit(3, "Attacker I"), "a1")
    .unit(P1, "base", unit(3, "Attacker II"), "a2")
    .unit(P1, "base", unit(3, "Attacker III"), "a3")
    .hand(P2, PORTAL_RESCUE, "pr")
    .build();
  await game.p1.move(["a1", "a2", "a3"], "bf1");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, defendingPlayer: P2 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
  return game;
}

describe("Ruling 460dbb2eeb9f4152 — removing the last defender does not end the showdown", () => {
  test("Portal Rescue pulls the lone defender home and the showdown is still running", async () => {
    const game = await threeOnOne();

    await game.p2.cast("pr", { targets: "def" });
    await game.p2.passPriority();
    await game.p1.passPriority();

    expect(game.locationOf("def")).toBe("base"); // banished, then replayed to base for free
    expect(game.zoneOf("pr")).toBe("trash");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P2 });
    // Focus simply carries on round the table.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("the defender still gets Focus after their last unit has gone, and only two passes end it", async () => {
    const game = await threeOnOne();
    await game.p2.cast("pr", { targets: "def" });
    await game.p2.passPriority();
    await game.p1.passPriority();

    await game.p1.passFocus();
    // Still the defender's window even with zero units at the battlefield.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.units("bf1")).toEqual([]);

    await game.p2.passFocus();
    await game.settle();

    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p1.units("bf1").sort()).toEqual(["a1", "a2", "a3"]);
  });
});
