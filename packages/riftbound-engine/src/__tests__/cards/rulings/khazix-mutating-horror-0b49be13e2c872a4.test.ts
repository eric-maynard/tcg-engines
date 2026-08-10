/**
 * Ruling 0b49be13e2c872a4 — Kha'Zix, Mutating Horror (UNL-143 → unl-143-219) · [4][chaos] · 4 Might
 *   "[Ambush] When I attack or defend, if an enemy unit is alone here, give me +2 [Might] this turn and gain 2 XP."
 *
 * Q: Can Kha'Zix, Mutating Horror trigger multiple times in a single turn?
 * A: Yes. It triggers each time he gains the Attacker/Defender designation in a NEW combat (once per combat);
 *    there is no "once each turn" wording. Each time, "if an enemy unit is alone here" is checked; the +2 [Might]
 *    "this turn" bonuses accumulate and 2 XP is gained each time.
 * Rules: 383.4.e/f (attack/defend triggers on designation, once per combat), 383.2 (condition), no once-per-turn limit.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KHAZIX = "unl-143-219";

/** P2's turn. P1's Kha'Zix alone holds bf1. P2 has two lone raiders in base that will attack one after the other. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", KHAZIX, "khazix")
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 1, name: "Raider One" }, "r1")
    .unit(P2, "base", { might: 1, name: "Raider Two" }, "r2");
}

async function firstDefence(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.xp()).toBe(0);
  expect(game.state("khazix").might).toBe(4);
  await game.p2.move("r1", "bf1");
  expect(game.state("khazix").combatRole).toBe("defender");
  expect(game.p2.units("bf1")).toEqual(["r1"]); // the enemy is alone here
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "khazix", controller: P1, triggered: true })]);
  await game.settle(); // trigger resolves, then combat: 6 vs 1 → Raider One dies
  return game;
}

describe("Ruling 0b49be13e2c872a4 — Kha'Zix's attack/defend trigger has no once-per-turn limit", () => {
  test("first combat this turn: defending against a lone Raider gives +2 Might (4 → 6) and 2 XP; the Raider dies", async () => {
    const game = await firstDefence();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("r1")).toBe("trash");
    expect(game.zoneOf("khazix")).toBe("battlefield-bf1");
    expect(game.state("khazix")).toMatchObject({ might: 6, mightModifier: 2 });
    expect(game.state("khazix").combatRole).toBeFalsy();
    expect(game.p1.xp()).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("second combat in the SAME turn: a second lone Raider attacks → Kha'Zix gains Defender again, the trigger goes on the chain again", async () => {
    const game = await firstDefence();
    await game.p2.move("r2", "bf1");
    expect(game.state("khazix").combatRole).toBe("defender");
    expect(game.p2.units("bf1")).toEqual(["r2"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "khazix", controller: P1, triggered: true })]);
  });

  test("…and resolves again: another +2 this turn (6 → 8, two stacked modifiers) and 2 more XP (total 4) — twice in one turn", async () => {
    const game = await firstDefence();
    await game.p2.move("r2", "bf1");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("r2")).toBe("trash");
    expect(game.state("khazix")).toMatchObject({ might: 8, mightModifier: 4, zone: "battlefield-bf1" });
    expect(game.p1.xp()).toBe(4);
    expect(game.turnPlayer()).toBe(P2); // still the same turn
    expect(game.turnNumber()).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("the 'this turn' bonuses all lapse together at end of turn (back to 4), the XP stays", async () => {
    const game = await firstDefence();
    await game.p2.move("r2", "bf1");
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("khazix")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.p1.xp()).toBe(4);
  });
});
