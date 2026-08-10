/**
 * Ruling 0c4fec07248a3672 — Wind Wall (OGN-064 → ogn-064-298) · Spell · Calm · Reaction · "Counter a spell."
 *   × Unchecked Power (OGN-123 → ogn-123-298) · Spell · Mind · 7 · "Exhaust all friendly units, then deal 12 to ALL
 *     units at battlefields."
 *
 * Q: If Unchecked Power is countered by Wind Wall, are the caster's units exhausted?
 * A: No. Exhausting the friendly units is part of the spell's RESOLUTION, not an additional cost. A countered spell
 *    never resolves, so the units stay as they were (and no damage is dealt).
 * Rules: 425 (counter: the spell leaves the chain without resolving; costs not refunded 425.1.c), 356 (costs vs effects).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WIND_WALL = "ogn-064-298";
const UNCHECKED_POWER = "ogn-123-298";

/**
 * P1's turn. P1: two ready units — Scout (2) holding bf1 and Clerk (1) in base; Unchecked Power in hand with ample
 * resources. P2: Brute (5) holding bf2, Wind Wall in hand with ample resources.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { mind: 3 } })
    .resources(P2, { energy: 3, power: { calm: 3 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
    .unit(P1, "base", { might: 1, name: "Clerk" }, "clerk")
    .unit(P2, "bf2", { might: 5, name: "Brute" }, "brute")
    .hand(P1, UNCHECKED_POWER, "up")
    .hand(P2, WIND_WALL, "ww");
}

async function castUncheckedPower(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("up");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "up", controller: P1 })]);
  return game;
}

describe("Ruling 0c4fec07248a3672 — Unchecked Power countered by Wind Wall exhausts nothing", () => {
  test("playing Unchecked Power exhausts NOTHING up front — the exhaust is an effect, not a cost: with the spell on the chain both P1 units are still ready", async () => {
    const game = await castUncheckedPower();
    expect(game.state("scout").isReady).toBe(true);
    expect(game.state("clerk").isReady).toBe(true);
    expect(game.p1.resources().energy).toBe(0); // the real cost (energy) WAS paid
  });

  test("P2 answers with Wind Wall: Unchecked Power is countered → P1's units are NOT exhausted, no unit takes 12, both spells in the trash, nothing refunded", async () => {
    const game = await castUncheckedPower();
    const p1PowerAfterCast = game.p1.resources().power.mind;
    await game.p1.passPriority();
    await game.p2.cast("ww", { targets: "up" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("up")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.state("scout")).toMatchObject({ damage: 0, isReady: true, zone: "battlefield-bf1" });
    expect(game.state("clerk")).toMatchObject({ damage: 0, isReady: true, zone: "base" });
    expect(game.state("brute")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: p1PowerAfterCast ?? 0 } }); // 425.1.c
    expect(game.violations()).toEqual([]);
  });

  test("contrast — uncountered, Unchecked Power resolves: both friendly units become exhausted, then 12 to every unit at a battlefield (Scout and Brute die; Clerk in base survives)", async () => {
    const game = await castUncheckedPower();
    await game.settle();
    expect(game.zoneOf("up")).toBe("trash");
    expect(game.state("clerk")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("trash");
  });
});
