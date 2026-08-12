/**
 * Ruling f06c2cff706644f6 — Draven, Audacious (SFD-148 → sfd-148-221) · 6 [Might] · [6][chaos] · [Deflect]
 *   "When I die in combat, choose an opponent. They score 1 point."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden] [Action] · "Kill a unit at a battlefield…"
 *
 * Q: My Draven is killed by an opponent's SPELL during a showdown. Does that count as dying in combat?
 * A: Yes — a unit is "in combat" while it holds the attacker/defender designation, which it keeps from arriving at
 *    the contested battlefield until combat ends. A spell that kills it there kills it in combat.
 * Nuance: move it off the battlefield first and the designation is gone, so the same kill does NOT trigger.
 * Rules: 461.7.a / 466.7.a (designations last until combat ends), 437 (attacker/defender), 383 (death trigger).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAVEN = "sfd-148-221";
const HIDDEN_BLADE = "ogn-213-298";

/** P1's turn. P2 holds bf1 with a 2-Might defender and a Hidden Blade hidden there; Draven waits in P1's base. */
function inCombatBoard() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 2, name: "Picket" }, "picket")
    .unit(P1, "base", DRAVEN, "draven")
    .facedown(P2, "bf1", HIDDEN_BLADE, "blade")
    .resources(P2, { power: { order: 1 } }); // [Deflect] surcharge for choosing Draven
}

/** Draven attacks; P2 gets the focus window. */
async function dravenAttacks(): Promise<Game> {
  const game = await inCombatBoard().build();
  await game.p1.move("draven", "bf1");
  expect(game.state("draven").combatRole).toBe("attacker");
  await game.p1.passFocus();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

describe("Ruling f06c2cff706644f6 — Draven killed by a spell mid-showdown died IN COMBAT", () => {
  test("premise: at the battlefield Draven holds the attacker designation", async () => {
    const game = await dravenAttacks();
    expect(game.locationOf("draven")).toBe("bf1");
    expect(game.state("draven")).toMatchObject({ combatRole: "attacker", might: 6 });
    expect(game.state("draven").keywords).toContain("Deflect");
  });

  test("the spell kills him while he is still there, and his 'die in combat' trigger fires: the opponent scores 1", async () => {
    const game = await dravenAttacks();
    await game.p2.reveal("blade", { answers: ["draven"] });
    await game.settle();
    expect(game.zoneOf("draven")).toBe("trash");
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: killed at a battlefield with no opposing units — no combat, no designation — the trigger does NOT fire", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", DRAVEN, "draven")
      .hand(P2, HIDDEN_BLADE, "blade")
      .resources(P2, { energy: 2, power: { order: 2 } }) // [2][order] + the [Deflect] surcharge
      .build();
    expect(game.state("draven").combatRole).toBe(null);
    await game.p2.cast("blade", { targets: "draven" });
    await game.settle();
    expect(game.zoneOf("draven")).toBe("trash");
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0);
  });
});
