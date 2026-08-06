/**
 * Flame Chompers — ogn-006-298 · Unit · Fury · 3 energy · 3 might
 *
 *   When you discard me, you may pay [fury] to play me.
 *
 * Rule 383.3.b: a cost right after "you may" at the start of a triggered
 * ability's effect is that ability's base cost — accepting pays [fury] and the
 * effect plays the Chompers (from trash, where the discard put it).
 * Discards are produced here with Chemtech Enforcer (ogn-003-298: "When you
 * play me, discard 1") so the discard comes from a real game effect.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CHOMPERS = "ogn-006-298";
const ENFORCER = "ogn-003-298"; // 2 energy · When you play me, discard 1.

/** P1 plays Enforcer with Chompers as the only other card in hand → Chompers is discarded. */
async function discardChompers(fury: number) {
  const game = await scenario()
    .resources(P1, { energy: 2, power: { fury } })
    .hand(P1, ENFORCER, "ce")
    .hand(P1, CHOMPERS, "fc")
    .build();
  await game.p1.play("ce", { to: "base" });
  await game.settle(); // trigger resolves; the single-card discard is forced
  return game;
}

describe("Flame Chompers (ogn-006-298)", () => {
  test("cost: 3 energy, no power — deducted on play; unaffordable with 2", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CHOMPERS, "fc").build();
    await game.p1.play("fc", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("fc")).toBe("base");
    expect(game.state("fc").might).toBe(3);
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, CHOMPERS, "fc").build();
    expect(poor.p1.can("play", "fc")).toBe(false);
  });

  test("when discarded, its controller is asked whether to pay [fury] (optional trigger)", async () => {
    const game = await discardChompers(1);
    expect(game.zoneOf("fc")).toBe("trash");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "fc" } });
    expect(game.p1.power("fury")).toBe(1); // nothing paid yet
  });

  test("accepting pays exactly [fury] (no energy) and plays the Chompers to the board", async () => {
    const game = await discardChompers(1);
    await game.p1.yes();
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("fc")).toBe("base");
    expect(game.p1.units("base")).toContain("fc");
    expect(game.violations()).toEqual([]);
  });

  test("declining leaves it in the trash and spends nothing", async () => {
    const game = await discardChompers(1);
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("fc")).toBe("trash");
    expect(game.p1.power("fury")).toBe(1);
    expect(game.decision()?.kind).toBe("action");
  });

  test("without [fury] to pay, the Chompers cannot be played off the discard", async () => {
    const game = await discardChompers(0);
    const d = game.decision();
    if (d?.kind === "yes-no") {
      const t = await game.p1.try((p) => p.yes());
      if (t.ok) {
        await game.settle();
      } else {
        await game.p1.no();
        await game.settle();
      }
    }
    expect(game.zoneOf("fc")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });
});
