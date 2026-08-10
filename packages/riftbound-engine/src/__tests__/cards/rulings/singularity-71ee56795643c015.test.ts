/**
 * Ruling 71ee56795643c015 — Singularity (OGN-105 → ogn-105-298) · Spell · [6]+[mind][mind] · "Deal 6 to each of up to two units."
 *   × Void Seeker (OGN-024 → ogn-024-298) · Action · [3]+[fury] · "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Q: A unit is damaged by Singularity; combat then starts at its battlefield, but the opposing unit is removed (Void Seeker)
 *    before combat damage is assigned. Does the damaged unit still heal at the end of that combat?
 * A: Yes. Once combat has begun it runs through all its steps, including the Resolution step where units at the
 *    battlefield are healed — even if no combat damage was ever assigned. The 7-Might Watcher goes from 6 damage to 0.
 * Rules: 465–467 (combat: showdown → damage → resolution; healing in resolution regardless of damage dealt).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SINGULARITY = "ogn-105-298";
const VOID_SEEKER = "ogn-024-298";

/**
 * P1's turn. P2 holds bf1 with a 7-Might Watcher; P1 has a 1-Might Recruit in base, Singularity in hand and [6]+2 mind.
 * P2 holds Void Seeker with [3]+fury.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 2 } })
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Watcher" }, "watcher")
    .unit(P1, "base", { might: 1, name: "Recruit" }, "recruit")
    .hand(P1, SINGULARITY, "sing")
    .hand(P2, VOID_SEEKER, "seeker");
}

async function singularityThenAttack(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("sing", { targets: ["watcher"] });
  await game.settle();
  expect(game.zoneOf("sing")).toBe("trash");
  expect(game.state("watcher").damage).toBe(6); // 1 "health" left
  expect(game.zoneOf("watcher")).toBe("battlefield-bf1");
  await game.p1.move("recruit", "bf1");
  // Combat has been initiated: a showdown is open at bf1 with the attacker holding Focus.
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.state("recruit").combatRole).toBe("attacker");
  expect(game.state("watcher").combatRole).toBe("defender");
  return game;
}

describe("Ruling 71ee56795643c015 — combat that loses its attacker before the damage step still heals the defender in Resolution", () => {
  test("during the showdown P2 Void Seekers the attacking Recruit: it dies before any combat damage is assigned", async () => {
    const game = await singularityThenAttack();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "seeker")).toBe(true);
    await game.p2.cast("seeker", { targets: "recruit" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("recruit")).toBe("trash");
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(1); // Void Seeker's "Draw 1"
  });

  test("combat still runs to Resolution: the Watcher (6 damage from Singularity) is healed to 0 right there — mid-turn, before any end-of-turn heal — and P2 keeps bf1", async () => {
    const game = await singularityThenAttack();
    await game.p1.passFocus();
    await game.p2.cast("seeker", { targets: "recruit" });
    await game.settle();
    // Back in P1's main phase of the SAME turn: the heal came from combat Resolution, not from the Ending Phase.
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("watcher").damage).toBe(0);
    expect(game.state("watcher").combatRole ?? null).toBeNull();
    expect(game.zoneOf("watcher")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
