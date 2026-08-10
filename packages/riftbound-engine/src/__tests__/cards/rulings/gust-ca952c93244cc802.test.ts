/**
 * Ruling ca952c93244cc802 — Gust (OGN-169 → ogn-169-298) · Reaction [1] "Return a unit at a battlefield with 3 [Might]
 *   or less to its owner's hand."   × Hextech Ray (OGN-009 → ogn-009-298) · Action [1][fury] "Deal 3 to a unit at a battlefield."
 *
 * Q: The defender Gusts away the (only) attacking unit mid-combat. Does the attacker still get to play spells before the
 *    combat ends and damage heals?
 * A: Yes. After Gust resolves a fresh round of Focus/priority begins; the showdown only ends once both players pass in a
 *    row. So the attacker can Hextech Ray the already-damaged defender ("Deadbloom") and kill it before the heal.
 * Rules: 341–343 (showdown ends only when all players pass with an empty chain), 465/520 (damage heals when combat ends).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const HEXTECH_RAY = "ogn-009-298";

/** P1's turn. P2 holds bf1 with a 4-Might Deadbloom carrying 2 damage. P1's 3-Might Ravenbloom attacks. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .resources(P2, { energy: 1, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Ravenbloom" }, "ravenbloom")
    .unit(P2, "bf1", { might: 4, name: "Deadbloom" }, "deadbloom", { damage: 2 })
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P2, GUST, "gust");
}

/** Attack, P1 passes focus, P2 Gusts the attacker and Gust resolves. */
async function gustTheAttacker(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("ravenbloom", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.state("ravenbloom").combatRole).toBe("attacker");
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("gust", { targets: "ravenbloom" });
  await game.p2.passPriority();
  await game.p1.passPriority(); // Gust resolves
  expect(game.zoneOf("gust")).toBe("trash");
  expect(game.zoneOf("ravenbloom")).toBe("hand");
  return game;
}

describe("Ruling ca952c93244cc802 — after Gust bounces the attacker there is still a spell window before combat ends", () => {
  test("Gust resolved: the showdown is STILL open, the chain is empty, P1 has Focus, and the Deadbloom's 2 damage has not healed", async () => {
    const game = await gustTheAttacker();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("deadbloom").damage).toBe(2);
    expect(game.p1.can("cast", "ray")).toBe(true);
  });

  test("P1 Hextech Rays the Deadbloom in that window: 2 + 3 damage ≥ 4 Might → it dies before any end-of-combat heal", async () => {
    const game = await gustTheAttacker();
    await game.p1.cast("ray", { targets: "deadbloom" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P1 })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ray resolves
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("deadbloom")).toBe("trash");
    // A new round of passing is needed to actually close the showdown.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: if both players just pass after Gust, the showdown ends, combat is over and the Deadbloom heals to 0 damage", async () => {
    const game = await gustTheAttacker();
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("deadbloom")).toBe("battlefield-bf1");
    expect(game.state("deadbloom").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    // Too late now: Hextech Ray alone (3 < 4) would no longer kill it.
  });
});
