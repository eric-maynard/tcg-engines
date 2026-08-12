/**
 * Ruling 23fd8f33f338f565 — Void Seeker (OGN-024 → ogn-024-298) · [3][fury] [Action]
 *   "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Q: If my unit is killed during a showdown after I passed focus, can I still act because focus comes
 *    back to me, or does the showdown end immediately?
 * A: Combat only ends when BOTH players pass focus consecutively with nothing on the chain. Passing once
 *    and then having the opponent respond breaks that run: after their chain resolves, focus returns to
 *    you and you may act again — even if your unit is now dead and you no longer contest the battlefield.
 * Rules: 310.3 / 345 (focus passes; a showdown closes only on consecutive passes over an empty chain),
 *        340 (resolution returns priority/focus), 190.4.b (control frozen while combat is ongoing).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const BLOOD_RUSH = "sfd-003-221"; // a cheap [Action] P1 can hold to prove they may still act

/** P1's turn: P1's 3-Might Scout attacks P2's bf1 (2-Might Sentry). P2 holds Void Seeker + [3][fury]. */
function board() {
  return scenario()
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Sentry" }, "sentry")
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .unit(P1, "base", { might: 4, name: "Reserve" }, "reserve")
    .resources(P1, { energy: 1 })
    .hand(P1, BLOOD_RUSH, "rush")
    .hand(P2, VOID_SEEKER, "seeker")
    .deck(P2, [{ cardType: "unit", energyCost: 1, might: 1, name: "Top" }], ["top"]);
}

describe("Ruling 23fd8f33f338f565 — focus returns after a chain resolves; the showdown does not end when a unit dies", () => {
  test("P1 (attacker) has focus first, passes it, and P2 answers with Void Seeker instead of passing", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
    await game.p2.cast("seeker", { targets: "scout" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "seeker", controller: P2 })]);
  });

  test("ruling: the chain resolves (the Scout dies), and focus comes back to P1 — the showdown is still open", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("seeker", { targets: "scout" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Void Seeker resolves: 4 damage to a 3-Might unit
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("ruling: P1 may play an [Action] again even with no unit left at bf1 — the showdown has not ended", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("seeker", { targets: "scout" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.p1.units("bf1")).toEqual([]); // no longer contesting bf1
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "rush")).toBe(true);
    await game.p1.cast("rush", { targets: "reserve" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rush", controller: P1 })]);
  });

  test("only two consecutive passes over an empty chain close the showdown", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("seeker", { targets: "scout" });
    await game.settle(); // resolves the chain, then both pass consecutively
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // P2 kept it
    expect(game.decision()).toMatchObject({ context: "main", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
