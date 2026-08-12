/**
 * Ruling be9c8f0a3c97d389 — Hextech Ray (OGN-009 → ogn-009-298) · Action [1][fury]
 *   "Deal 3 to a unit at a battlefield."
 *   × Vi, Destructive (OGN-036 → ogn-036-298) · 3 Might · "[Ganking] · Recycle 1 from your trash: Give me +1
 *     [Might] this turn."
 *
 * Q: Vi is in the combat and gets hit by Hextech Ray during the showdown — does she die before combat damage?
 * A: Yes. The showdown's spells all resolve before the Combat Damage Step; only units still at the
 *    battlefield when combat resolution starts contribute damage. Lethal Ray damage kills Vi first, so she
 *    assigns nothing and the defenders survive.
 * Rules: 465.2 (only units present at the start of the Combat Damage Step assign damage), 466.2, 331/347
 *        (showdown chains resolve before combat is resolved).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";
const VI_DESTRUCTIVE = "ogn-036-298"; // 3 Might

/** P1's turn: Vi attacks bf1, held by P2's 3-Might Sentry. P2 keeps [1][fury] and a Hextech Ray in hand. */
function board(withRay = true) {
  const s = scenario()
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Sentry" }, "sentry")
    .unit(P1, "base", VI_DESTRUCTIVE, "vi");
  return withRay ? s.hand(P2, HEXTECH_RAY, "ray") : s;
}

/** Vi attacks; P2 takes Focus and Rays her; the chain resolves. */
async function rayVi(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("vi", "bf1");
  expect(game.state("vi").combatRole).toBe("attacker");
  await game.p1.passFocus(); // attacker's Focus → defender
  await game.p2.cast("ray", { targets: "vi" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  return game;
}

describe("Ruling be9c8f0a3c97d389 — a unit killed by a spell during the showdown deals no combat damage", () => {
  test("ruling: the Ray's 3 is lethal on the 3-Might Vi and she dies while the showdown is still going", async () => {
    const game = await rayVi();
    expect(game.zoneOf("vi")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });

  test("ruling: the defending Sentry is untouched — Vi contributed nothing to the Combat Damage Step", async () => {
    const game = await rayVi();
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("battlefield-bf1");
    expect(game.state("sentry").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: leave Vi alive and her 3 Might trades with the 3-Might Sentry in the damage step", async () => {
    const game = await board(false).build();
    await game.p1.move("vi", "bf1");
    await game.settle();
    expect(game.zoneOf("vi")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash"); // both died — she DID assign her damage
  });

  test("ruling: the timing matters — the same Ray thrown after combat damage would be too late (the Sentry is already dead)", async () => {
    const game = await board().build();
    await game.p1.move("vi", "bf1");
    await game.settle(); // nobody intervenes: combat resolves
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("vi")).toBe("trash");
    expect(game.p2.hand()).toContain("ray"); // never used
  });
});
