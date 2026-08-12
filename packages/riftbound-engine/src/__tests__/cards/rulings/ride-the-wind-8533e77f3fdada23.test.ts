/**
 * Ruling 8533e77f3fdada23 — Ride the Wind (OGN-173 → ogn-173-298) · Action · Chaos · [2][chaos]
 *   "Move a friendly unit and ready it."
 *
 * Q: Ride the Wind is played during a showdown to move a champion to another battlefield, triggering a
 *    showdown there. Which showdown resolves first?
 * A: The one already running. You always finish the current showdown completely, then process the one that
 *    was staged at the other battlefield.
 * Rules: 323.12/323.13 (a staged Showdown/Combat begins only in a Neutral Open State), 460 (one combat at a
 *        time), 347 (Action speed inside a showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

const activeShowdowns = (game: Game) =>
  (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).map((s) => s.battlefieldId);

/** P1's turn. P2 holds bf1 and bf2 with a 2-Might Guard each; P1 has a Striker and a Champion in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Guard 1" }, "guard1")
    .unit(P2, "bf2", { might: 2, name: "Guard 2" }, "guard2")
    .unit(P1, "base", { might: 5, name: "Striker" }, "striker")
    .unit(P1, "base", { might: 5, name: "Champion" }, "champion")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Striker attacks bf1; during that showdown P1 rides the Champion into bf2, staging a second combat. */
async function stageSecond(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("striker", "bf1");
  expect(activeShowdowns(game)).toEqual(["bf1"]);
  await game.p1.cast("rtw", { answers: ["battlefield-bf2"], targets: "champion" });
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Ruling 8533e77f3fdada23 — the showdown you are already in finishes before the one Ride the Wind staged", () => {
  test("the Champion lands at bf2 (ready) and contests it, but bf1 is still the only ACTIVE showdown", async () => {
    const game = await stageSecond();
    expect(game.locationOf("champion")).toBe("bf2");
    expect(game.state("champion").isReady).toBe(true); // "…and ready it"
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(activeShowdowns(game)).toEqual(["bf1"]);
    expect(game.state("champion").combatRole).toBeNull();
    expect(game.state("guard2").combatRole).toBeNull();
  });

  test("bf1's combat is completely finished and scored before bf2's showdown opens", async () => {
    const game = await stageSecond();
    await game.acting().passFocus();
    await game.acting().passFocus();

    expect(game.zoneOf("guard1")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("guard2")).toBe("battlefield-bf2"); // bf2 untouched so far
    expect(activeShowdowns(game)).toEqual(["bf2"]);
  });

  test("bf2 is then fought out for the second point", async () => {
    const game = await stageSecond();
    await game.acting().passFocus();
    await game.acting().passFocus();
    await game.settle();
    expect(game.zoneOf("guard2")).toBe("trash");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
