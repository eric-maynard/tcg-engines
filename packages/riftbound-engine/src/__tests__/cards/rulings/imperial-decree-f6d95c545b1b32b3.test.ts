/**
 * Ruling f6d95c545b1b32b3 — Imperial Decree (OGN-221 → ogn-221-298) · [Action] spell · [5][order][order]
 *   "When any unit takes damage this turn, kill it."
 *
 * Q: I attack one unit into two defenders; the defender casts Imperial Decree. Does my attacker die instantly,
 *    or can it still kill both defenders first?
 * A: Nothing happens until the Combat Damage Step. Damage is ASSIGNED (attacker first, then defender) and then
 *    all of it is DEALT simultaneously; only then does the Decree's delayed trigger fire. An attacker with enough
 *    Might kills every defender, and dies alongside them.
 * Rules: 465.2.c (assign attacker-first, 465.2.c.1.a simultaneous dealing), 465.2.d (deal), 383 (delayed trigger).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";

/** P1's turn. P2 holds bf1 with two 2-Might defenders; P1's 5-Might attacker waits in base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 2, name: "Guard A" }, "guardA")
    .unit(P2, "bf1", { might: 2, name: "Guard B" }, "guardB")
    .unit(P1, "base", { might: 5, name: "Champion" }, "attacker")
    .hand(P2, IMPERIAL_DECREE, "decree")
    .resources(P2, { energy: 5, power: { order: 2 } });
}

/** P1 attacks; P2 answers with Imperial Decree and it resolves before any damage. */
async function decreeInPlay(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("attacker", "bf1");
  await game.p1.passFocus();
  await game.p2.cast("decree", { targets: undefined });
  await game.acting().passPriority();
  await game.acting().passPriority();
  return game;
}

describe("Ruling f6d95c545b1b32b3 — Imperial Decree waits for the damage step; the attacker trades with BOTH defenders", () => {
  test("the Decree resolving kills nothing — no damage has been dealt yet", async () => {
    const game = await decreeInPlay();
    expect(game.zoneOf("decree")).toBe("trash");
    expect(game.zoneOf("attacker")).toBe("battlefield-bf1");
    expect(game.zoneOf("guardA")).toBe("battlefield-bf1");
    expect(game.zoneOf("guardB")).toBe("battlefield-bf1");
    expect(game.state("attacker").damage).toBe(0);
  });

  test("combat damage: 5 Might kills both 2-Might defenders, and the Decree then kills the damaged attacker too", async () => {
    const game = await decreeInPlay();
    await game.settle();
    expect(game.zoneOf("guardA")).toBe("trash");
    expect(game.zoneOf("guardB")).toBe("trash");
    expect(game.zoneOf("attacker")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("nobody remains at the battlefield, so nobody conquers it and no point is scored", async () => {
    const game = await decreeInPlay();
    await game.settle();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("control contrast: without the Decree the 5-Might attacker survives its 4 damage (healed at the Combat Cleanup) and conquers", async () => {
    const game = await board().build();
    await game.p1.move("attacker", "bf1");
    await game.settle();
    expect(game.zoneOf("guardA")).toBe("trash");
    expect(game.zoneOf("guardB")).toBe("trash");
    expect(game.zoneOf("attacker")).toBe("battlefield-bf1");
    expect(game.state("attacker").damage).toBe(0); // rule 466.1.a.1 — the Combat Cleanup heals survivors
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
