/**
 * Ruling b92199da22068136 — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield · "When you defend here, you may move a friendly unit
 *     here to base." (Cleave ogn-004-298 is cited only for the "defender is still not the assaulting side" nuance.)
 *
 * Q: If the defender uses Reaver's Row to pull their (only) unit out during a showdown, does the showdown end and does the
 *    attacker score the conquer point immediately?
 * A: No. The showdown continues — it only ends when both players pass Focus in a row without starting a chain. The defender
 *    keeps control of the battlefield throughout the showdown; only when it fully resolves is control/conquest determined.
 * Rules: 341–344 (showdown ends on consecutive Focus passes), 188 / 190.4 (control persists while contested), 465–466
 *        (combat resolution → conquer), 383.4.f (defend trigger on the initial chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";

/** P1's turn. P2 holds the live Reaver's Row with a lone Runner (2). P1's Raider (3) is ready in base. */
function board() {
  return scenario()
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false, owner: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "row", { might: 2, name: "Runner" }, "runner")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider");
}

const row = (game: Game) => game.gameState.battlefields.row;

/** Raider attacks; P2 opts into the Row and pulls the Runner; the trigger resolves (both pass priority). */
async function attackAndRetreat(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "row");
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "row" } });
  await game.p2.yes();
  if (game.decision()?.kind === "pick") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "row" } });
    await game.p2.pick("runner");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P2, targets: ["runner"], triggered: true })]);
  await game.acting().passPriority();
  await game.acting().passPriority();
  expect(game.chain()).toEqual([]);
  expect(game.locationOf("runner")).toBe("base");
  return game;
}

describe("Ruling b92199da22068136 — pulling the defender out with Reaver's Row neither ends the showdown nor scores the attacker early", () => {
  test("after the Runner retreats the showdown is STILL open (a Focus decision is pending), the Row is still contested and STILL controlled by P2, and P1 has scored nothing", async () => {
    const game = await attackAndRetreat();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(row(game)).toMatchObject({ contested: true, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.units("row")).toEqual([]); // nobody of P2's is left there — and yet control has not changed
    expect(game.state("raider").combatRole).toBe("attacker"); // roles persist mid-showdown
  });

  test("one Focus pass is not enough either: after the first pass the showdown, P2's control and P1's 0 points all still stand", async () => {
    const game = await attackAndRetreat();
    const first = game.actingSeat()!;
    await game.seat(first).passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.actingSeat()).not.toBe(first);
    expect(row(game)).toMatchObject({ contested: true, controller: P2 });
    expect(game.p1.points()).toBe(0);
  });

  test("only when BOTH players pass Focus in a row does the showdown end and combat resolve: no defenders remain → P1 conquers the Row and scores 1; the Runner is safe in P2's base", async () => {
    const game = await attackAndRetreat();
    await game.seat(game.actingSeat()!).passFocus();
    await game.seat(game.actingSeat()!).passFocus();
    await game.settle();
    expect(row(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.locationOf("raider")).toBe("row");
    expect(game.state("raider").combatRole).toBeNull();
    expect(game.zoneOf("runner")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
