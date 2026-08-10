/**
 * Ruling 3dba1ce688acd7a7 — Singularity (OGN-105 → ogn-105-298) · [6]+[mind][mind] · "Deal 6 to each of up to two units."
 *   × Void Seeker (OGN-024 → ogn-024-298) · [3]+[fury] · "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [2]+[order] · "Kill a unit at a battlefield. Its controller draws 2."
 *   × Flash (OGS-011 → ogs-011-024) · Reaction · [2] · "Move up to 2 friendly units to base."
 *
 * Q: A unit is targeted by a spell and then moved to a different location (Flash → base) before it resolves. Does it survive?
 * A: Depends on the spell's location restriction. None (Singularity) → still a legal target, it is hit. "At a
 *    battlefield" (Void Seeker) → target now illegal, no damage — but instructions not referencing the target still
 *    happen (Void Seeker's caster draws 1). Instructions that reference the target's information need it legal
 *    (Hidden Blade: no kill AND its controller does not draw 2).
 * Rules: 359.3 (recheck target requirements on resolution), 359.3.f (illegal target → dependent text does nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SINGULARITY = "ogn-105-298";
const VOID_SEEKER = "ogn-024-298";
const HIDDEN_BLADE = "ogn-213-298";
const FLASH = "ogs-011-024";

type Res = { energy: number; power: Record<string, number> };

/** P2's turn holding `spell` with exactly its cost. P1: a 7-Might Runner on P1's bf1 (survives a 6) and Flash with [2]. */
function board(spell: string, cost: Res) {
  return scenario()
    .active(P2)
    .resources(P2, cost)
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 7, name: "Runner" }, "runner")
    .hand(P2, spell, "spell")
    .hand(P1, FLASH, "flash");
}

/** P2 casts the spell at Runner; P1 responds with Flash on Runner; Flash resolves (Runner → base), spell still waiting. */
async function targetedThenFlashed(spell: string, cost: Res, targets: string | string[]): Promise<{ game: Game; p1Hand0: number; p2Hand0: number }> {
  const game = await board(spell, cost).build();
  const p1Hand0 = game.p1.hand().length;
  const p2Hand0 = game.p2.hand().length;
  await game.p2.cast("spell", { targets });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "spell", targets: ["runner"] })]);
  await game.p2.passPriority();
  await game.p1.cast("flash", { targets: ["runner"] });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Flash resolves
  expect(game.zoneOf("flash")).toBe("trash");
  expect(game.zoneOf("runner")).toBe("base");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "spell", targets: ["runner"] })]); // target unchanged
  return { game, p1Hand0, p2Hand0 };
}

describe("Ruling 3dba1ce688acd7a7 — whether a Flashed-away target dodges a spell depends on the spell's location restriction", () => {
  test("no location restriction (Singularity, 'a unit'): Runner in base is still legal and takes the full 6", async () => {
    const { game } = await targetedThenFlashed(SINGULARITY, { energy: 6, power: { mind: 2 } }, ["runner"]);
    await game.settle();
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("base");
    expect(game.state("runner").damage).toBe(6);
    expect(game.violations()).toEqual([]);
  });

  test("location restriction (Void Seeker, 'a unit at a battlefield'): Runner in base is no longer legal — NO damage — yet the independent 'Draw 1' still happens for the caster", async () => {
    const { game, p2Hand0 } = await targetedThenFlashed(VOID_SEEKER, { energy: 3, power: { fury: 1 } }, "runner");
    await game.settle();
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("base");
    expect(game.state("runner").damage).toBe(0);
    expect(game.p2.hand()).toHaveLength(p2Hand0 - 1 + 1); // Void Seeker left hand, caster drew 1
    expect(game.violations()).toEqual([]);
  });

  test("target-referencing rider (Hidden Blade, 'Kill a unit at a battlefield. Its controller draws 2'): Runner survives AND its controller P1 draws nothing", async () => {
    const { game, p1Hand0, p2Hand0 } = await targetedThenFlashed(HIDDEN_BLADE, { energy: 2, power: { order: 1 } }, "runner");
    await game.settle();
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("base");
    expect(game.state("runner").damage).toBe(0);
    expect(game.p1.hand()).toHaveLength(p1Hand0 - 1); // only Flash left P1's hand; no "draws 2"
    expect(game.p2.hand()).toHaveLength(p2Hand0 - 1);
    expect(game.violations()).toEqual([]);
  });

  test("control — without Flash, Void Seeker's 4 lands on Runner at the battlefield (and the caster draws 1)", async () => {
    const game = await board(VOID_SEEKER, { energy: 3, power: { fury: 1 } }).build();
    const p2Hand0 = game.p2.hand().length;
    await game.p2.cast("spell", { targets: "runner" });
    await game.settle();
    expect(game.zoneOf("runner")).toBe("battlefield-bf1");
    expect(game.state("runner").damage).toBe(4);
    expect(game.p2.hand()).toHaveLength(p2Hand0 - 1 + 1);
  });
});
