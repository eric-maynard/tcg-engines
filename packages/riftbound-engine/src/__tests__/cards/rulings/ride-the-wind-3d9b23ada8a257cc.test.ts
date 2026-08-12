/**
 * Ruling 3d9b23ada8a257cc — Ride the Wind (OGN-173 → ogn-173-298) · [Action] · [2][chaos]
 *   "Move a friendly unit and ready it."
 *
 * Q: During a combat, both players Ride the Wind a unit onto the SAME unoccupied battlefield. Who is the
 *    attacker there?
 * A: Whoever got there first: their unit applied the Contested status, so they are the Attacker at the new
 *    battlefield and the second arrival is the Defender. The new fight does not interrupt the one in
 *    progress — it is staged, the current combat finishes, the chain empties, and only in the following
 *    Open State does the showdown at the new battlefield begin.
 * Rules: 442.1.a.1/.2 (the player who applies Contested is the Attacker, the other is the Defender),
 *        445/446 (Contested), 323.8/323.12 (a showdown is staged during Cleanup and begins later), 340.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/**
 * P1's turn. Combat at bf1: P1's Vanguard (3) attacks P2's Wall (3). bf2 is open — no controller, nobody
 * there. Both players hold a Ride the Wind and a spare unit at home to send.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 3, name: "Vanguard" }, "vanguard")
    .unit(P1, "base", { might: 2, name: "Runner P1" }, "runnerA")
    .unit(P2, "base", { might: 2, name: "Runner P2" }, "runnerB")
    .hand(P1, RIDE_THE_WIND, "rtwA")
    .hand(P2, RIDE_THE_WIND, "rtwB");
}

/** Answer a destination prompt with `bf`, if one is open. */
async function chooseDestination(game: Game, seat: typeof P1, bf: string): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === seat) {
      const hit = d.options.find((o) => String(o.card ?? o.key).includes(bf));
      await game.seat(seat).pick(String(hit?.key ?? bf));
    } else {
      return;
    }
  }
}

/**
 * Combat opens at bf1 (P1 attacking). With focus, P1 Rides its Runner onto the open bf2 first; then P2
 * answers by Riding their Runner onto the same bf2.
 */
async function bothRideToBf2(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("vanguard", "bf1");
  expect(game.state("vanguard").combatRole).toBe("attacker");
  expect(game.state("wall").combatRole).toBe("defender");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("rtwA", { targets: "runnerA" });
  await chooseDestination(game, P1, "bf2"); // the destination is named as the spell is finalized
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.locationOf("runnerA")).toBe("bf2");
  // Now P2 answers with theirs.
  while (game.decision()?.kind === "action" && game.decision()?.seat !== P2) {
    await game.acting().pass();
  }
  await game.p2.cast("rtwB", { targets: "runnerB" });
  await chooseDestination(game, P2, "bf2");
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.locationOf("runnerB")).toBe("bf2");
  return game;
}

describe("Ruling 3d9b23ada8a257cc — the first unit onto the empty battlefield is the attacker there", () => {
  test("step 1: P1's Runner reaches the open bf2 first and applies Contested — bf2 is contested BY P1", async () => {
    const game = await board().build();
    await game.p1.move("vanguard", "bf1");
    await game.p1.cast("rtwA", { targets: "runnerA" });
    await chooseDestination(game, P1, "bf2");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("runnerA")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.contestedBy).toBe(P1);
  });

  test("step 2: P2's Runner follows it in — bf2 is still contested by P1 (the first arrival), and both units stand there", async () => {
    const game = await bothRideToBf2();
    expect(game.p1.units("bf2")).toEqual(["runnerA"]);
    expect(game.p2.units("bf2")).toEqual(["runnerB"]);
    expect(game.gameState.battlefields.bf2?.contestedBy).toBe(P1);
  });

  test("the new fight does not interrupt the old one: the combat at bf1 resolves first (3 vs 3 — both die, P1 conquers nothing)", async () => {
    const game = await bothRideToBf2();
    while (game.gameState.battlefields.bf1?.contested === true && game.decision()?.kind === "action") {
      await game.acting().pass();
    }
    expect(game.zoneOf("vanguard")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
  });

  test("ruling 3d9b23ada8a257cc — only once bf1 is settled does the showdown at bf2 open, with the FIRST arrival as Attacker and the second as Defender", async () => {
    const game = await bothRideToBf2();
    for (let i = 0; i < 20; i++) {
      if (game.state("runnerA").combatRole === "attacker") {
        break;
      }
      const d = game.decision();
      if (d?.kind === "action" && d.passKey) {
        await game.acting().pass();
      } else {
        break;
      }
    }
    expect(game.state("runnerA")).toMatchObject({ combatRole: "attacker", controller: P1 });
    expect(game.state("runnerB")).toMatchObject({ combatRole: "defender", controller: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("…and that second combat then plays out at bf2 (2 vs 2 — both die, nobody scores it)", async () => {
    const game = await bothRideToBf2();
    await game.settle();
    expect(game.zoneOf("runnerA")).toBe("trash");
    expect(game.zoneOf("runnerB")).toBe("trash");
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });
});
