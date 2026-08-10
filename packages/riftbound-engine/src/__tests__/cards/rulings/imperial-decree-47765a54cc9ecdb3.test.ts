/**
 * Ruling 47765a54cc9ecdb3 — Imperial Decree (OGN-221 → ogn-221-298) · Spell · Order · [5][order][order] · Action
 *   "When any unit takes damage this turn, kill it."
 *   × Stupefy (OGN-095 → ogn-095-298) · Reaction · [1] · "Give a unit -1 [Might] this turn, to a minimum of 1. Draw 1."
 *   × Hextech Ray (OGN-009 → ogn-009-298) · Action · [1][fury] · "Deal 3 to a unit at a battlefield."
 *
 * Q: Does giving a unit -1 Might count as "damage" for Imperial Decree?
 * A: No. Might modification and damage are separate things: Decree needs actual (non-zero) damage dealt. A
 *    might reduction only moves the stat. (A unit can still die when its Might drops to its marked damage —
 *    e.g. Hextech Ray 3 then Stupefy on a 4-Might unit — but that is lethal damage, not Decree.)
 * Rules: 437 (damage), 430-ish might modification vs damage counters, 520 (a unit with damage ≥ Might dies).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";
const STUPEFY = "ogn-095-298";
const HEXTECH_RAY = "ogn-009-298";

/**
 * P1's turn with [7][order][order][fury] — Decree (5+OO), Stupefy (1), Ray (1+F). P2 holds bf1 with a 3-Might
 * Target and a 5-Might Biggie (Ray's 3 is NOT lethal to it on its own).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { fury: 1, order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Target" }, "target")
    .unit(P2, "bf1", { might: 5, name: "Biggie" }, "biggie")
    .hand(P1, IMPERIAL_DECREE, "decree")
    .hand(P1, STUPEFY, "stupefy")
    .hand(P1, HEXTECH_RAY, "ray");
}

async function decreeInForce(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("decree");
  await game.settle();
  expect(game.zoneOf("decree")).toBe("trash");
  expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1, order: 0 } });
  return game;
}

describe("Ruling 47765a54cc9ecdb3 — a Might reduction is not damage: Imperial Decree ignores Stupefy", () => {
  test("with Decree in force, Stupefy on the 3-Might Target drops it to 2 Might with ZERO damage marked — it is not killed", async () => {
    const game = await decreeInForce();
    await game.p1.cast("stupefy", { targets: "target" });
    await game.settle();
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.zoneOf("target")).toBe("battlefield-bf1");
    expect(game.state("target").might).toBe(2);
    expect(game.state("target").damage).toBe(0);
    expect(game.chain()).toEqual([]); // no Decree trigger was ever created
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("contrast — real damage does count: Hextech Ray's non-lethal 3 to the 5-Might Biggie makes Decree kill it", async () => {
    const game = await decreeInForce();
    await game.p1.cast("ray", { targets: "biggie" });
    await game.settle();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("biggie")).toBe("trash"); // 3 < 5, yet dead — Decree's "takes damage → kill it"
    expect(game.zoneOf("target")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("nuance (no Decree): a 4-Might unit that took 3 from Hextech Ray survives, then dies when Stupefy lowers its Might to 3 — death by lethal damage, not by 'taking damage'", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Four" }, "four")
      .hand(P1, STUPEFY, "stupefy")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await game.p1.cast("ray", { targets: "four" });
    await game.settle();
    expect(game.zoneOf("four")).toBe("battlefield-bf1");
    expect(game.state("four").damage).toBe(3);
    expect(game.state("four").might).toBe(4);
    await game.p1.cast("stupefy", { targets: "four" });
    await game.settle();
    expect(game.zoneOf("four")).toBe("trash");
  });
});
