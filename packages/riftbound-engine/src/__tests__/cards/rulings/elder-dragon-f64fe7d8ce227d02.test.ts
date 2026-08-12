/**
 * Ruling f64fe7d8ce227d02 — Elder Dragon (UNL-118 → unl-118-219) · 10 Might · 12 + [body]×4
 *   "Any amount of your damage is enough to kill enemy units.
 *    When you play me, choose up to one enemy unit at each location. Deal 1 to them."
 *
 * Q: If Elder Dragon is killed during the damage assignment of a combat showdown, does its passive
 *    still make my damage lethal?
 * A: Yes. Combat damage is assigned and dealt simultaneously; the lethal threshold for enemy units is
 *    read at that moment, while Elder Dragon is still on the battlefield. Its dying to the very same
 *    combat damage does not retroactively un-kill the units its damage killed.
 * Rules: 465.2.c (combat damage is assigned in one step, thresholds read then), 465.2.c.4.a (the
 *        lethal amount, replacement/modifier aware), 466 (deaths are settled after assignment).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ELDER_DRAGON = "unl-118-219";

/** P2 holds bf1 with a 12-Might Titan and two 5-Might Guards — 22 Might, easily lethal to the 10-Might Dragon. */
function board(opts: { dragon: boolean }) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", opts.dragon ? ELDER_DRAGON : { might: 10, name: "Behemoth" }, "attacker")
    .unit(P2, "bf1", { might: 12, name: "Titan" }, "titan")
    .unit(P2, "bf1", { might: 5, name: "Guard A" }, "g1")
    .unit(P2, "bf1", { might: 5, name: "Guard B" }, "g2");
}

async function toAssignment(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) {
  await game.p1.move("attacker", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "distribute", seat: P1 });
  return d as Extract<Decision, { kind: "distribute" }>;
}

describe("Ruling f64fe7d8ce227d02 — Elder Dragon's lethality passive holds for the damage assigned in the combat that kills it", () => {
  test("while Elder Dragon is in the combat, every enemy unit's lethal amount is 1", async () => {
    const game = await board({ dragon: true }).build();
    const d = await toAssignment(game);
    expect(d.total).toBe(10);
    expect(d.buckets.map((b) => [b.card, b.lethal])).toEqual([
      ["titan", 1],
      ["g1", 1],
      ["g2", 1],
    ]);
  });

  test("1 damage apiece kills all three defenders even though the Dragon dies to the same simultaneous damage", async () => {
    const game = await board({ dragon: true }).build();
    await toAssignment(game);
    await game.p1.distribute({ g1: 1, g2: 8, titan: 1 });
    await game.settle();
    expect(game.zoneOf("titan")).toBe("trash");
    expect(game.zoneOf("g1")).toBe("trash");
    expect(game.zoneOf("g2")).toBe("trash");
    expect(game.zoneOf("attacker")).toBe("trash"); // 22 into 10 Might
    // Nobody is left at bf1, so nobody controls it (466.5.b).
    expect(game.gameState.battlefields.bf1.controller).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  test("contrast: an ordinary 10-Might attacker has to pay full Might per kill, so the same 10 damage cannot clear the board", async () => {
    const game = await board({ dragon: false }).build();
    const d = await toAssignment(game);
    expect(d.buckets.map((b) => [b.card, b.lethal])).toEqual([
      ["titan", 12],
      ["g1", 5],
      ["g2", 5],
    ]);
    const oneEach = await game.p1.try((p) => p.distribute({ g1: 1, g2: 8, titan: 1 }));
    expect(oneEach.ok).toBe(false);
    await game.p1.distribute({ g1: 5, g2: 5, titan: 0 });
    await game.settle();
    expect(game.zoneOf("g1")).toBe("trash");
    expect(game.zoneOf("g2")).toBe("trash");
    expect(game.zoneOf("titan")).toBe("battlefield-bf1"); // survives
    expect(game.violations()).toEqual([]);
  });
});
