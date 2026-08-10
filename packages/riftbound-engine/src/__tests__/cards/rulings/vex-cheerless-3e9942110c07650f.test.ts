/**
 * Ruling 3e9942110c07650f — Vex, Cheerless (SFD-146 → sfd-146-221) · Champion Unit · Chaos · [5][chaos] · 5 Might
 *     "While I'm in combat, friendly spells cost [1][rainbow] less to a minimum of [1], and enemy spells cost
 *      [1][rainbow] more."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction · [1][calm]   × Fight or Flight (OGN-168 → ogn-168-298) · Action · [2]
 *   (Ezreal, Prodigy sfd-149-221 is cited only as an example of an un-floored reducer.)
 *
 * Q: How do multiple Vex, Cheerless affect spell costs, given the "minimum of 1"?
 * A: Each Vex is a separate –[1]/–[rainbow] discount whose "minimum [1]" floor applies to THAT discount's energy step;
 *    they are applied one after another. Two Vex: Defy ([1][calm]) → [1] + 0 power. Enemy spells get +[1][rainbow]
 *    PER Vex (one Vex: Fight or Flight [2] → [3] + 1 power). Only while Vex is in combat.
 * Rules: 356.3 / 356.4 (increases then reductions when determining total cost), 135.2.e.5.b ([rainbow] = a power of
 *        any domain), 464 (in combat = has an Attacker/Defender designation in an ongoing combat).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX = "sfd-146-221";
const DEFY = "ogn-045-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";
/** Inline P2 [Action] with base cost [1], no power: "Deal 1 to a unit." */
const JAB = { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 1, name: "Test Jab", timing: "action" } as const;
/** Inline P1 [Action] spells with base cost [2] / [3], no power. */
const RALLY2 = { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "chaos", energyCost: 2, name: "Test Rally Two", timing: "action" } as const;
const RALLY3 = { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "chaos", energyCost: 3, name: "Test Rally Three", timing: "action" } as const;

/**
 * P1's turn. P2 holds bf1 with a stunned 3-Might Defender (no combat damage back). P1 has `vexCount` Vex ready in base
 * (they attack together → all "in combat").
 */
function board(vexCount: 1 | 2) {
  const s = scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3, name: "Defender" }, "def", { stunned: true }).unit(P1, "base", VEX, "vexA");
  return vexCount === 2 ? s.unit(P1, "base", VEX, "vexB") : s;
}

/** All of P1's Vex attack bf1; drain any initial chain; stop with the showdown open and P1 holding Focus. */
async function vexesAttack(game: Game, vexes: string[]): Promise<void> {
  await game.p1.move(vexes, "bf1");
  for (const v of vexes) {
    expect(game.state(v).combatRole).toBe("attacker");
  }
  for (let i = 0; i < 6 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
    await game.acting().passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
}

describe("Ruling 3e9942110c07650f — Vex, Cheerless discounts/surcharges stack per Vex, each with its own [1] floor", () => {
  test("TWO Vex in combat, enemy spell: P2's [1] Jab costs [1]+2 = [3] plus 2 power (+[1][rainbow] per Vex) — exactly 3E/2R is drained; 3E/1R can't cast it", async () => {
    const game = await board(2).resources(P2, { energy: 3, power: { rainbow: 2 } }).hand(P2, JAB, "jab").build();
    await vexesAttack(game, ["vexA", "vexB"]);
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "jab")).toBe(true);
    await game.p2.cast("jab", { targets: "vexA" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    const short = await board(2).resources(P2, { energy: 3, power: { rainbow: 1 } }).hand(P2, JAB, "jab").build();
    await vexesAttack(short, ["vexA", "vexB"]);
    await short.p1.passFocus();
    expect(short.p2.can("cast", "jab")).toBe(false);
  });

  test("TWO Vex in combat, friendly Defy ([1][calm]) in response: 1st Vex → energy stays [1] (floor), power 1→0; 2nd Vex → still [1] + 0 — P1 casts Defy with exactly 1 energy and NO power", async () => {
    const game = await board(2)
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 3, power: { rainbow: 2 } })
      .hand(P1, DEFY, "defy")
      .hand(P2, JAB, "jab")
      .build();
    await vexesAttack(game, ["vexA", "vexB"]);
    await game.p1.passFocus();
    await game.p2.cast("jab", { targets: "vexA" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.p1.can("cast", "defy")).toBe(true);
    await game.p1.cast("defy", { targets: "jab" });
    expect(game.p1.resources().energy).toBe(0); // paid [1], no power at all
    expect(game.chain().map((c) => c.cardId)).toEqual(["jab", "defy"]);
    await game.settle();
    expect(game.zoneOf("jab")).toBe("trash");
    expect(game.state("vexA").damage).toBe(0); // countered
  });

  test("…and the floor is per discount, not 'free': with 0 energy P1 can NOT cast Defy even with two Vex in combat", async () => {
    const game = await board(2)
      .resources(P1, { energy: 0, power: { calm: 1 } })
      .resources(P2, { energy: 3, power: { rainbow: 2 } })
      .hand(P1, DEFY, "defy")
      .hand(P2, JAB, "jab")
      .build();
    await vexesAttack(game, ["vexA", "vexB"]);
    await game.p1.passFocus();
    await game.p2.cast("jab", { targets: "vexA" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "defy")).toBe(false);
  });

  test("TWO Vex in combat, friendly no-power spells: a [2] spell costs [1] (2→1, then floor) and a [3] spell costs [1] (3→2→1) — each discount's result feeds the next", async () => {
    const two = await board(2).resources(P1, { energy: 1 }).hand(P1, RALLY2, "r2").build();
    await vexesAttack(two, ["vexA", "vexB"]);
    expect(two.p1.can("cast", "r2")).toBe(true);
    await two.p1.cast("r2", { targets: "def" });
    expect(two.p1.energy()).toBe(0);
    const three = await board(2).resources(P1, { energy: 1 }).hand(P1, RALLY3, "r3").build();
    await vexesAttack(three, ["vexA", "vexB"]);
    expect(three.p1.can("cast", "r3")).toBe(true);
    await three.p1.cast("r3", { targets: "def" });
    expect(three.p1.energy()).toBe(0);
    const zero = await board(2).resources(P1, { energy: 0 }).hand(P1, RALLY2, "r2").build();
    await vexesAttack(zero, ["vexA", "vexB"]);
    expect(zero.p1.can("cast", "r2")).toBe(false); // never below [1]
  });

  test("ONE Vex in combat, enemy Fight or Flight ([2]): costs [3] + 1 power — exactly 3E/1R is drained; 2E/1R or 3E/0R can't cast it", async () => {
    const game = await board(1).resources(P2, { energy: 3, power: { rainbow: 1 } }).hand(P2, FIGHT_OR_FLIGHT, "fof").build();
    await vexesAttack(game, ["vexA"]);
    await game.p1.passFocus();
    expect(game.p2.can("cast", "fof")).toBe(true);
    await game.p2.cast("fof", { targets: "vexA" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    for (const pool of [
      { energy: 2, power: { rainbow: 1 } },
      { energy: 3, power: { rainbow: 0 } },
    ]) {
      const short = await board(1).resources(P2, pool).hand(P2, FIGHT_OR_FLIGHT, "fof").build();
      await vexesAttack(short, ["vexA"]);
      await short.p1.passFocus();
      expect(short.p2.can("cast", "fof")).toBe(false);
    }
  });

  test("'only while in combat': with both Vex idle in base (no showdown), P1's [2] spell costs the full [2] and P2's spells are not surcharged on P2's turn", async () => {
    const idle = await board(2).resources(P1, { energy: 1 }).hand(P1, RALLY2, "r2").build();
    expect(idle.state("vexA").combatRole).toBeNull();
    expect(idle.p1.can("cast", "r2")).toBe(false); // needs the full [2]
    const full = await board(2).resources(P1, { energy: 2 }).hand(P1, RALLY2, "r2").build();
    await full.p1.cast("r2", { targets: "def" });
    expect(full.p1.energy()).toBe(0);
    const p2turn = await board(2).active(P2).resources(P2, { energy: 1 }).hand(P2, JAB, "jab").build();
    expect(p2turn.p2.can("cast", "jab")).toBe(true);
    await p2turn.p2.cast("jab", { targets: "vexA" });
    expect(p2turn.p2.resources()).toEqual({ energy: 0, power: {} });
  });
});
