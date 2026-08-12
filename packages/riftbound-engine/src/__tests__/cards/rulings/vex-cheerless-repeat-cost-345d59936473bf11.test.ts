/**
 * Ruling 345d59936473bf11 — Vex, Cheerless (SFD-146 → sfd-146-221) × [Repeat] spells
 *   Vex, Cheerless: "While I'm in combat, friendly spells cost [1][rainbow] less to a minimum of [1], and
 *   enemy spells cost [1][rainbow] more."
 *   Blood Rush (SFD-003 → sfd-003-221): "[Action] [Repeat] [1] — Give a unit [Assault 2] this turn."
 *   Feral Strength (SFD-034 → sfd-034-221): "[Reaction] [Repeat] [2] — Give a unit +2 [Might] this turn."
 *
 * Q: Does Vex reduce the TOTAL cost of a spell with [Repeat]?
 * A: Yes. The discount applies to the total cost — base plus the paid Repeat cost — subject to Vex's own
 *    "minimum of [1]" on the discounted total.
 * Rules: 391 (determining total cost: base + additional costs), 353.4 (cost reductions apply to the total),
 *        820 ([Repeat] is an optional additional cost of the one play), 349 (additional costs).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX = "sfd-146-221"; // 5 Might
const BLOOD_RUSH = "sfd-003-221"; // [1], [Repeat] [1]
const FERAL = "sfd-034-221"; // [2], [Repeat] [2]

/** P1's turn. P2 holds bf1 behind a big Wall; P1's unit walks in so that a combat showdown is on. */
async function inCombatWith(unit: string | { might: number; name: string }, spell: string): Promise<Game> {
  const game = await scenario()
    .resources(P1, { energy: 9 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 12, name: "Wall" }, "wall")
    .unit(P1, "base", unit, "front")
    .hand(P1, spell, "spell")
    .build();
  await game.p1.move("front", "bf1");
  expect(game.state("front").combatRole).toBe("attacker"); // "while I'm in combat"
  return game;
}

/** Energy actually spent casting `spell` (with or without its Repeat). */
async function spend(game: Game, repeat: boolean): Promise<number> {
  const before = game.p1.energy();
  await game.p1.cast("spell", repeat ? { repeat: 1, targets: "front" } : { targets: "front" });
  return before - game.p1.energy();
}

describe("Ruling 345d59936473bf11 — Vex's discount applies to base + [Repeat], i.e. to the total cost", () => {
  test("baseline without Vex: Blood Rush costs [1], and [1] more when its Repeat is paid", async () => {
    expect(await spend(await inCombatWith({ might: 5, name: "Plain" }, BLOOD_RUSH), false)).toBe(1);
    expect(await spend(await inCombatWith({ might: 5, name: "Plain" }, BLOOD_RUSH), true)).toBe(2);
  });

  test("with Vex in combat, a REPEATED Blood Rush costs [1]: the total 1 + 1 was discounted, not just the base", async () => {
    const game = await inCombatWith(VEX, BLOOD_RUSH);
    expect(await spend(game, true)).toBe(1);
    // resolve just the spell (never settle() here — that would fight the combat out)
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("front").grantedKeywords).toEqual([
      { duration: "turn", keyword: "Assault", value: 2 },
      { duration: "turn", keyword: "Assault", value: 2 },
    ]); // the effect really did happen twice
    expect(game.state("front").might).toBe(9); // 5 + 2 + 2 while attacking
    expect(game.violations()).toEqual([]);
  });

  test("the 'minimum of [1]' is a floor on the discounted total, not a per-part rule: an unrepeated [1] Blood Rush still costs [1]", async () => {
    expect(await spend(await inCombatWith(VEX, BLOOD_RUSH), false)).toBe(1);
  });

  test("a bigger Repeat shows the single -[1] on the sum: Feral Strength [2] + Repeat [2] = 4 → 3 with Vex (and 2 → 1 unrepeated)", async () => {
    expect(await spend(await inCombatWith(VEX, FERAL), true)).toBe(3);
    expect(await spend(await inCombatWith(VEX, FERAL), false)).toBe(1);
    expect(await spend(await inCombatWith({ might: 5, name: "Plain" }, FERAL), true)).toBe(4);
  });

  test("Vex must be IN COMBAT for any of it: parked in base she discounts nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9 })
      .unit(P1, "base", VEX, "front")
      .hand(P1, FERAL, "spell")
      .build();
    expect(game.state("front").combatRole).toBeNull();
    expect(await spend(game, true)).toBe(4);
  });
});
