/**
 * Ruling 4ddd82e581e39c04 — Ki Barrier (VEN-126 → ven-126-166) · Spell · Order · 2+[order] · [Reaction]
 *   "Choose a unit. Prevent the next 7 damage that would be dealt to it this turn."
 *   (+ an inline "Big Blast" action spell "Deal N to a unit." as the damage source.)
 *
 * Q: Do two Ki Barriers on the same unit stack?
 * A: Yes — each creates its own Prevent 7 pool; together they prevent 14 damage this turn (the first absorbs up to 7, the
 *    second whatever remains up to another 7).
 * Rules: 437.1.b.1 (Prevent pools tracked on the unit), 372 (multiple replacement effects each apply), 437.5.a (all
 *        Prevent values on a unit are considered together).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KI_BARRIER = "ven-126-166";

function bigBlast(n: number) {
  return {
    abilities: [{ effect: { amount: n, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
    cardType: "spell",
    energyCost: 0,
    name: `Big Blast ${n}`,
    rulesText: `[Action] Deal ${n} to a unit.`,
    timing: "action",
  };
}

/** P2's turn holding Big Blast N. P1's Monk (3) holds bf1; P1 has two Ki Barriers and exactly their cost (2×(2+[order])). */
function board(n: number) {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 4, power: { order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Monk" }, "monk")
    .hand(P1, KI_BARRIER, "kb1")
    .hand(P1, KI_BARRIER, "kb2")
    .hand(P2, bigBlast(n), "blast");
}

/** P2 blasts the Monk; P1 answers with `barriers` Ki Barriers in the reaction window; everything resolves. */
async function blastWithBarriers(n: number, barriers: 1 | 2): Promise<Game> {
  const game = await board(n).build();
  await game.p2.cast("blast", { targets: "monk" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.cast("kb1", { targets: "monk" });
  if (barriers === 2) {
    await game.p1.cast("kb2", { targets: "monk" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blast", "kb1", "kb2"]);
  }
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("blast")).toBe("trash");
  return game;
}

describe("Ruling 4ddd82e581e39c04 — two Ki Barriers stack to Prevent 14", () => {
  test("baseline, ONE Ki Barrier vs 15 damage: only 7 is prevented — the Monk (3 Might) takes 8 and dies", async () => {
    const game = await blastWithBarriers(15, 1);
    expect(game.zoneOf("monk")).toBe("trash");
    expect(game.zoneOf("kb2")).toBe("hand");
  });

  // Expected: each Ki Barrier adds its own Prevent 7 pool (437.1.b.1) ⇒ 14 prevented, Monk takes 1 and lives.
  // Actual: the second Ki Barrier overwrites the unit's `damagePreventionShield` (7 stays 7), only 7 is prevented, the Monk
  // takes 8 and dies (damageLog: original 15 → 8, modifiedBy prevent-shield kb1 only).
  test("ruling 4ddd82e581e39c04 — a second Ki Barrier does not stack (shield overwritten to 7, not 14); TWO Ki Barriers vs 15 should leave the Monk alive with 1 damage", async () => {
    const game = await blastWithBarriers(15, 2);
    expect(game.state("monk")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    const hit = (game.gameState.damageLog ?? []).find((r) => r.target === "monk");
    expect(hit).toMatchObject({ amount: 1, target: "monk" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("exactly 14, not more: TWO Ki Barriers vs 17 damage leave 3 — lethal for the 3-Might Monk", async () => {
    const game = await blastWithBarriers(17, 2);
    expect(game.zoneOf("monk")).toBe("trash");
  });

  // Same defect: with only 7 prevented, 14 damage leaves 7 ⇒ the Monk dies instead of taking nothing.
  test("ruling 4ddd82e581e39c04 — TWO Ki Barriers vs 14 should prevent all of it (engine prevents only 7 and the Monk dies)", async () => {
    const game = await blastWithBarriers(14, 2);
    expect(game.state("monk")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect((game.gameState.damageLog ?? []).filter((r) => r.target === "monk" && r.amount > 0)).toEqual([]);
  });
});
