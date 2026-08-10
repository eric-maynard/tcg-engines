/**
 * Ruling 66dbbab1068fdaab — Fight or Flight (OGN-168 → ogn-168-298) · Chaos spell · [2] "[Hidden] [Action] Move a unit from a
 *     battlefield to its base."
 *   × Hextech Ray (OGN-009 → ogn-009-298) · Fury Action · [1][fury] "Deal 3 to a unit at a battlefield."
 *
 * Q: The active player Fight-or-Flights the opponent's (only) defender home during a showdown. Before the showdown
 *    resolves, can the opponent still play an Action (Hextech Ray) at the active player's unit there?
 * A: Yes. Showdowns never end automatically: after Fight or Flight resolves the opponent receives Focus and may cast
 *    Hextech Ray at the attacker on the battlefield; only then does the showdown continue to its end.
 * Rules: 341–347 (Focus passes between players in a showdown; Actions legal while holding Focus on an empty chain),
 *        348 (a showdown ends only when all players pass in succession).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const HEXTECH_RAY = "ogn-009-298";

/** P1's turn, [2]. P2 holds bf1 with a lone 2-Might Guard and has Hextech Ray + exactly [1][fury]. P1's 3-Might Raider in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, FIGHT_OR_FLIGHT, "fof")
    .hand(P2, HEXTECH_RAY, "ray");
}

/** Raider attacks; P1 (Focus) casts Fight or Flight on the Guard; both pass → it resolves. */
async function guardSentHome(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("fof", { targets: "guard" });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Fight or Flight resolves
  expect(game.zoneOf("fof")).toBe("trash");
  expect(game.zoneOf("guard")).toBe("base");
  return game;
}

describe("Ruling 66dbbab1068fdaab — after Fight or Flight empties the defense, the opponent still gets Focus for an Action", () => {
  test("Fight or Flight resolved: the Guard is in P2's base, the Raider stands alone at bf1 — yet the showdown is STILL OPEN (nothing conquered, no points) and Focus has passed to P2", async () => {
    const game = await guardSentHome();
    expect(game.chain()).toEqual([]);
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)?.focusPlayer).toBe(P2);
  });

  test("ruling: holding Focus on an empty chain, P2 may cast Hextech Ray (an ACTION) at the Raider on the battlefield", async () => {
    const game = await guardSentHome();
    expect(game.p2.can("cast", "ray")).toBe(true);
    const offered = (game.p2.option("cast", "ray")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("raider");
    await game.p2.cast("ray", { targets: "raider" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P2, targets: ["raider"] })]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Ray resolves: 3 to the 3-Might Raider — lethal
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash");
  });

  test("…and only then does the showdown wind down: with the Raider dead P1 conquers nothing (0 points); bf1 is not P1's", async () => {
    const game = await guardSentHome();
    await game.p2.cast("ray", { targets: "raider" });
    await game.settle();
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller ?? null).not.toBe(P1);
    expect(game.zoneOf("guard")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: if P2 just passes instead, the showdown ends and the unopposed Raider conquers bf1 for a point", async () => {
    const game = await guardSentHome();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("ray")).toBe("hand");
  });
});
