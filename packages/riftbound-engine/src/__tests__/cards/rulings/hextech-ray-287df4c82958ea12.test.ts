/**
 * Ruling 287df4c82958ea12 — Hextech Ray (OGN-009 → ogn-009-298) · Fury · [1][fury] · [Action]
 *   "Deal 3 to a unit at a battlefield."
 *
 * Q: The defender plays an action in the showdown; the chain resolves and focus goes back to the attacker. If
 *    the attacker then passes focus, is the showdown over?
 * A: No. Focus MOVING because a chain resolved is not a pass. The defender gets focus back and may act again;
 *    the showdown closes only on two consecutive passes of focus.
 * Rules: 348 (a showdown closes when both players pass focus in succession), 419.2 (priority/focus after a
 *        chain resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";

/** P1's turn. P2 holds bf1 with a 2-Might Guard, [1][fury] and two Hextech Rays. P1 attacks with a 6-Might Brute. */
function board() {
  return scenario()
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 6, name: "Brute" }, "brute")
    .hand(P2, HEXTECH_RAY, "ray1")
    .hand(P2, HEXTECH_RAY, "ray2");
}

/** Attack, P1 passes focus, P2 (defender) plays a Ray at the attacker, and the chain resolves. */
async function rayInShowdown(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("brute", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("ray1", { targets: "brute" });
  await game.p2.passPriority();
  await game.p1.passPriority(); // the Ray resolves
  expect(game.chain()).toEqual([]);
  expect(game.state("brute").damage).toBe(3);
  return game;
}

describe("Ruling 287df4c82958ea12 — focus returning after a chain resolves is not a pass; the showdown needs two consecutive passes", () => {
  test("after the Ray resolves, focus is with the ATTACKER and the showdown is still open", async () => {
    const game = await rayInShowdown();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("brute").combatRole).toBe("attacker");
  });

  test("ruling: the attacker passing focus does NOT end the showdown — the defender gets focus back and may play another action", async () => {
    const game = await rayInShowdown();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ray2")).toBe(true);
    // Nothing has been resolved as combat yet.
    expect(game.state("brute")).toMatchObject({ combatRole: "attacker", damage: 3 });
    expect(game.state("guard")).toMatchObject({ combatRole: "defender", damage: 0 });
  });

  test("…and the defender really can use it: a second Ray finishes the 6-Might attacker off before any combat damage", async () => {
    const game = await rayInShowdown();
    await game.p1.passFocus();
    await game.p2.cast("ray2", { targets: "brute" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("brute")).toBe("trash"); // 3 + 3 ≥ 6
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("it closes only when the defender ALSO passes: pass, pass ⇒ combat damage and a result", async () => {
    const game = await rayInShowdown();
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("guard")).toBe("trash"); // the Brute's 6 ≥ 2
    expect(game.zoneOf("brute")).toBe("battlefield-bf1"); // 3 + 2 < 6, then healed after combat
    expect(game.state("brute").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
