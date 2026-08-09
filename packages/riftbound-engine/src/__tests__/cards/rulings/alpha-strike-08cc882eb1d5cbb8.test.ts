/**
 * Ruling 08cc882eb1d5cbb8 — Alpha Strike (UNL-192 → unl-192-219) [Action] · 3 + [C]
 *   "Choose a friendly unit. It deals damage equal to its Might split among enemy units at battlefields.
 *    Then for each unit this kills, do this: Gain 1 XP."
 *   × Baron Nashor (UNL-147 → unl-147-219) 12 Might "…I can't be chosen by enemy spells and abilities.
 *     Other friendly units have +2 [Might]."
 *
 * Q: Can you Alpha Strike a battlefield where Baron Nashor is?
 * A: Yes, but Baron cannot be chosen to receive any of the damage — splitting damage among units is
 *    "choosing" them. You pick other legal enemy units there; if Baron is the only enemy unit at
 *    battlefields, no damage can be assigned at all.
 * Rules: 355 (choosing), Baron's "can't be chosen" static; Alpha Strike need not hit every unit.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ALPHA_STRIKE = "unl-192-219";
const BARON_NASHOR = "unl-147-219";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn: Champion in base, Alpha Strike funded. P2's Baron (12) at bf1 plus `minions` 1-Might Minions (3 each with Baron's +2). */
function board(opts: { allyMight: number; minions: number }) {
  let s = scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: opts.allyMight, name: "Champion" }, "ally")
    .unit(P2, "bf1", BARON_NASHOR, "baron")
    .hand(P1, ALPHA_STRIKE, "alpha");
  for (let i = 1; i <= opts.minions; i++) {
    s = s.unit(P2, "bf1", { might: 1, name: `Minion ${i}` }, `m${i}`);
  }
  return s;
}

const targetSets = (game: Game) => (game.p1.option("cast", "alpha")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];

/** Answer every damage-assignment prompt, alternating between the Minions; records every bucket ever offered. */
async function assignAll(game: Game): Promise<string[]> {
  const seen = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const d: Decision | null = game.decision();
    if (d?.kind !== "distribute") {
      break;
    }
    expect(d.seat).toBe(P1); // the Alpha Strike player chooses where each point goes
    for (const b of d.buckets) {
      seen.add((b.card ?? b.key) as string);
    }
    const open = d.buckets.filter((b) => b.max > 0);
    const pick = open[i % open.length]!;
    await game.p1.distribute({ [pick.key]: 1 });
  }
  return [...seen].toSorted();
}

describe("Ruling 08cc882eb1d5cbb8 — Alpha Strike at Baron Nashor's battlefield: legal, but Baron can't be chosen for damage", () => {
  test("Alpha Strike is castable with Baron at bf1; the enemy-unit choices offered include the Minion there but never Baron, and naming Baron is rejected", async () => {
    const game = await board({ allyMight: 4, minions: 1 }).build();
    expect(game.state("baron").might).toBe(12);
    expect(game.state("m1").might).toBe(3); // Baron: other friendly units +2
    expect(game.p1.can("cast", "alpha")).toBe(true);
    const sets = targetSets(game);
    expect(sets.length).toBeGreaterThan(0);
    expect(sets.some((s) => s.includes("m1"))).toBe(true);
    expect(sets.flat()).not.toContain("baron");
    const r = await game.p1.try((p) => p.cast("alpha", { targets: ["ally", "baron"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("alpha")).toBe("hand");
  });

  test("splitting the damage is 'choosing': with two Minions chosen, every assignment prompt offers only those Minions — Baron is never a recipient; 6 Might kills both (2 XP), Baron takes 0", async () => {
    const game = await board({ allyMight: 6, minions: 2 }).build();
    await game.p1.cast("alpha", { targets: ["ally", "m1", "m2"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    const offered = await assignAll(game);
    expect(offered).toEqual(["m1", "m2"]);
    await game.settle();
    expect(game.zoneOf("alpha")).toBe("trash");
    expect(game.zoneOf("m1")).toBe("trash");
    expect(game.zoneOf("m2")).toBe("trash");
    expect(game.state("baron").damage).toBe(0);
    expect(game.zoneOf("baron")).toBe("battlefield-bf1");
    expect(game.p1.xp()).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  // Expected: the single chosen Minion (3 Might) receives all 4 of the Champion's damage and dies (+1 XP);
  // Baron untouched. Actual: when exactly ONE enemy unit is chosen the engine deals it no damage at all
  // (the split loop never assigns), so the Minion survives undamaged.
  test("BUG: ruling 08cc882eb1d5cbb8 — engine deals 0 when a single enemy unit is chosen; expected: the lone chosen Minion beside Baron takes all 4 and dies, Baron untouched", async () => {
    const game = await board({ allyMight: 4, minions: 1 }).build();
    await game.p1.cast("alpha", { targets: ["ally", "m1"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await assignAll(game);
    await game.settle();
    expect(game.zoneOf("alpha")).toBe("trash");
    expect(game.state("baron").damage).toBe(0);
    expect(game.zoneOf("baron")).toBe("battlefield-bf1");
    expect(game.zoneOf("m1")).toBe("trash");
    expect(game.p1.xp()).toBe(1);
  });

  test("Baron is the ONLY enemy unit at battlefields: the spell can still be played (choose the friendly unit) but no damage can be assigned anywhere — Baron takes 0, no XP", async () => {
    const game = await board({ allyMight: 4, minions: 0 }).build();
    expect(game.p1.can("cast", "alpha")).toBe(true);
    expect(targetSets(game)).toEqual([["ally"]]); // only the friendly unit; no enemy recipient is choosable
    await game.p1.cast("alpha", { targets: ["ally"] });
    await game.settle();
    expect(game.decision()?.kind).toBe("action"); // no assignment prompt ever appeared
    expect(game.zoneOf("alpha")).toBe("trash");
    expect(game.state("baron").damage).toBe(0);
    expect(game.zoneOf("baron")).toBe("battlefield-bf1");
    expect(game.p1.xp()).toBe(0);
  });
});
