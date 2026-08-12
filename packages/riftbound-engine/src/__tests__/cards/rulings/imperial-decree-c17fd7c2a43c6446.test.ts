/**
 * Ruling c17fd7c2a43c6446 — Imperial Decree (OGN-221 → ogn-221-298) · Action [5][order][order]
 *   "When any unit takes damage this turn, kill it."
 *
 * Q: My 5-Might unit attacks a battlefield holding five 3-Might defenders while Imperial Decree is up. Do I
 *    kill all of them?
 * A: No — at most two. Combat damage must be assigned lethally to one defender before the next gets any, so
 *    5 Might reaches only 3 (lethal) + 2 (not lethal, but damage). Decree then kills every unit that actually
 *    took damage: defenders #1 and #2, plus your own unit (which took 5 back). Defenders #3–#5 took nothing
 *    and survive; the defenders win the combat and keep the battlefield.
 * Rules: 465.2.c.3 (lethal damage must be assigned in order), 465.2.c.4 (lethal amount), 391/370 ("when it
 *        takes damage" effects run on the marked damage), 466.5 (winner = who remains).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";

/** P1's turn: a lone 5-Might Hero, Imperial Decree in hand ([5][order][order] exactly), five 3-Might defenders at bf1. */
function board() {
  const s = scenario()
    .autoProcedures(false)
    .resources(P1, { energy: 5, power: { order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 5, name: "Hero" }, "hero")
    .hand(P1, IMPERIAL_DECREE, "decree");
  for (let i = 1; i <= 5; i++) {
    s.unit(P2, "bf1", { might: 3, name: `D${i}` }, `d${i}`);
  }
  return s;
}

/** Put Imperial Decree up, attack with the Hero and reach the damage-assignment prompt. */
async function attackUnderDecree(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("decree");
  await game.settle();
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  await game.p1.move("hero", "bf1");
  await game.settle();
  await game.p1.choose("resolveFullCombat:bf1");
  return game;
}

describe("Ruling c17fd7c2a43c6446 — Imperial Decree does not bypass lethal damage assignment: 2 defenders die, not 5", () => {
  test("ruling: the 5 damage must be assigned lethally in order — every defender's lethal threshold is 3", async () => {
    const game = await attackUnderDecree();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 5 });
    expect((d as { buckets: { key: string; lethal?: number }[] }).buckets.map((b) => b.lethal)).toEqual([3, 3, 3, 3, 3]);
  });

  test("ruling: spreading 1 damage onto each of the five is ILLEGAL — that is the trap the question falls into", async () => {
    const game = await attackUnderDecree();
    const spread = await game.p1.try((p) => p.distribute({ d1: 1, d2: 1, d3: 1, d4: 1, d5: 1 }));
    expect(spread.ok).toBe(false);
    const threeWays = await game.p1.try((p) => p.distribute({ d1: 2, d2: 2, d3: 1 }));
    expect(threeWays.ok).toBe(false); // no defender reaches lethal, so the damage may not fan out
    const stillNoLethal = await game.p1.try((p) => p.distribute({ d1: 2, d2: 2 }));
    expect(stillNoLethal.ok).toBe(false); // d1 must reach 3 before d2 gets anything
  });

  test("ruling: the only shape available is 3 (lethal) + 2 — so exactly two defenders ever take damage", async () => {
    const game = await attackUnderDecree();
    await game.p1.distribute({ d1: 3, d2: 2 });
    await game.p1.choose("resolveFullCombat:bf1");
    await game.settle();
    expect(game.zoneOf("d1")).toBe("trash"); // lethal damage
    expect(game.zoneOf("d2")).toBe("trash"); // only 2 damage — killed by the Decree
    expect(game.zoneOf("d3")).toBe("battlefield-bf1");
    expect(game.zoneOf("d4")).toBe("battlefield-bf1");
    expect(game.zoneOf("d5")).toBe("battlefield-bf1");
  });

  test("ruling: your own unit dies too — the defenders' 15 Might easily assigns 5 to it", async () => {
    const game = await attackUnderDecree();
    await game.p1.distribute({ d1: 3, d2: 2 });
    await game.p1.choose("resolveFullCombat:bf1");
    await game.settle();
    expect(game.zoneOf("hero")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test("ruling: three defenders remain and P1 has none — the defenders win and keep the battlefield", async () => {
    const game = await attackUnderDecree();
    await game.p1.distribute({ d1: 3, d2: 2 });
    await game.p1.choose("resolveFullCombat:bf1");
    await game.settle();
    expect(game.p2.units("bf1").sort()).toEqual(["d3", "d4", "d5"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
