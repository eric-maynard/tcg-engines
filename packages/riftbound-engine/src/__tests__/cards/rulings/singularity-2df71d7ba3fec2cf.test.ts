/**
 * Ruling 2df71d7ba3fec2cf — Singularity (OGN-105 → ogn-105-298) · 6 + [mind][mind] "Deal 6 to each of up to two units."
 *   × Gust (OGN-169 → ogn-169-298) [Reaction] "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Fight or Flight (OGN-168 → ogn-168-298) [Action] "Move a unit from a battlefield to its base."
 *   (× Hextech Ray ogn-009-298 — named only as an example of what could still be played in the Focus window.)
 *
 * Q: A unit at a battlefield was damaged by Singularity. During the following showdown there, either the
 *    opposing attacker is removed (Gust) or the damaged unit leaves to base (Fight or Flight). Does the
 *    damaged unit heal when the showdown ends?
 * A: Yes, in both cases. Removing units doesn't end the showdown by itself — it ends only when both players
 *    pass Focus with no chain; the combat's Resolution Step then performs a Combat Cleanup that heals ALL
 *    units (wherever they are).
 * Rules: 143.3.b.2, 466.1.a.1 ("3c. Heal all Units"), 465.1 (damage step only if both sides remain), 344/464 (Focus).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SINGULARITY = "ogn-105-298";
const GUST = "ogn-169-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/**
 * P1's turn. P2's 8-Might Brute holds bf1. P1: Singularity (6 + [mind][mind]) in hand and a ready 3-Might Raider
 * in base. P2 holds Gust (1) and Fight or Flight (2) with 3 energy.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 2 } })
    .resources(P2, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Brute" }, "brute")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, SINGULARITY, "sing")
    .hand(P2, GUST, "gust")
    .hand(P2, FIGHT_OR_FLIGHT, "fof");
}

/** Singularity 6 → Brute (survives, 6 marked); Raider attacks bf1 → combat showdown, P1 holds Focus and passes it. */
async function damagedBruteUnderAttack(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("sing", { targets: ["brute"] });
  await game.settle();
  expect(game.zoneOf("sing")).toBe("trash");
  expect(game.state("brute")).toMatchObject({ damage: 6, zone: "battlefield-bf1" });
  await game.p1.move("raider", "bf1");
  expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 2df71d7ba3fec2cf — a Singularity-damaged unit heals when the showdown ends, even if a combatant was removed", () => {
  test("case Gust: P2 bounces the 3-Might attacker; the showdown does NOT end by itself (P1 still gets Focus), and once both pass the combat cleanup heals the Brute to 0", async () => {
    const game = await damagedBruteUnderAttack();
    await game.p2.cast("gust", { targets: "raider" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("raider")).toBe("hand");
    expect(game.p1.hand()).toContain("raider");
    // Showdown still open: a Focus window remains (the ruling's "opponent could still play Hextech Ray").
    const d = game.decision();
    expect(d).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.state("brute").damage).toBe(6); // not healed yet — the showdown hasn't ended
    await game.settle(); // both pass Focus → showdown closes → Resolution Step → Combat Cleanup heals all units
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("brute")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("case Fight or Flight: P2 sends its own damaged Brute to base mid-showdown; when the showdown ends the Brute (now in base) is healed to 0 and the Raider conquers the emptied bf1", async () => {
    const game = await damagedBruteUnderAttack();
    await game.p2.cast("fof", { targets: "brute" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Fight or Flight resolves
    expect(game.state("brute")).toMatchObject({ location: "base", zone: "base" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.state("brute").damage).toBe(6); // still marked while the showdown is open
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("brute")).toMatchObject({ damage: 0, location: "base" });
    expect(game.state("raider")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
