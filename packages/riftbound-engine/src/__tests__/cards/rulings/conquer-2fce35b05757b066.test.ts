/**
 * Ruling 2fce35b05757b066 — Voracious Gromp (UNL-100 → unl-100-219) · 5 Might ·
 *   "[Hunt 3] (When I conquer or hold, gain 3 XP.)"
 *
 * Q: Do conquer effects on a unit trigger if that unit dies during the showdown?
 * A: No. Control is established (and the Conquer happens) only after the showdown/combat ends, so a unit
 *    that died before that point is not there to conquer. Its ally can still take the battlefield — the
 *    conquer just belongs to whoever is standing there, and the dead unit's own trigger never fires.
 * Rules: 466.3 / 466.5 (combat result, then Establish Control → Conquer), 469.1 (conquering),
 *        383 (a triggered ability needs its source on the board when the trigger condition is met).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GROMP = "unl-100-219"; // 5 Might · [Hunt 3]

/** [Action] "Deal 5 to a unit." — P2's answer during the showdown. */
const BOLT5 = {
  abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt 5",
  rulesText: "[Action] Deal 5 to a unit.",
  timing: "action",
} as const;

/** P1 attacks P2's bf1 (a 2-Might Sentry) with the Gromp AND a 7-Might Bruiser; P2 holds a Bolt 5. */
const board = () =>
  scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Sentry" }, "sentry")
    .unit(P1, "base", GROMP, "gromp")
    .unit(P1, "base", { might: 7, name: "Bruiser" }, "bruiser")
    .hand(P2, BOLT5, "bolt");

async function attack(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.xp()).toBe(0);
  await game.p1.move(["gromp", "bruiser"], "bf1");
  expect(game.state("gromp").combatRole).toBe("attacker");
  return game;
}

describe("Ruling 2fce35b05757b066 — a unit that dies in the showdown never conquers", () => {
  test("baseline: the Gromp survives the showdown, P1 conquers bf1 and [Hunt 3] pays out", async () => {
    const game = await attack();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("gromp")).toBe("battlefield-bf1");
    expect(game.p1.xp()).toBe(3);
    expect(game.p1.points()).toBe(1);
  });

  test("P2 kills the Gromp during the showdown: P1 still conquers with the Bruiser, but the Gromp's conquer trigger does NOT fire", async () => {
    const game = await attack();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.cast("bolt", { targets: "gromp" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("gromp")).toBe("trash"); // dead before control is established
    await game.settle();
    // The conquer still happens — for the surviving Bruiser.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("sentry")).toBe("trash");
    // …but the dead unit's "when I conquer" never triggered.
    expect(game.p1.xp()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
