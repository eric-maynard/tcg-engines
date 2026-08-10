/**
 * Interaction: Alpha Strike (unl-192-219) · Spell · 3+[rainbow] · [Action]
 *     "Choose a friendly unit. IT deals damage equal to its Might split among enemy units at
 *      battlefields. Then for each unit this kills, do this: Gain 1 XP."
 *   × Void Gate (ogn-296-298, battlefield) "Spells and abilities deal 1 Bonus Damage to units here."
 *   × Firestorm (ogs-002-024) · Spell · 6+[fury] "Deal 3 to all enemy units at a battlefield."  — contrast
 *
 * Question: P2 has three 1-Might tokens and one 3-Might unit at Void Gate. Alpha Strike with P1's 3-Might
 * F (in base) as the source — 3 or 4 targets? pool 3 or 4 (or +1 per target)? who is the source / gets the
 * kills and XP? Contrast Firestorm at Void Gate.
 *
 * Rules: 417.6.b.3 (a spell that names a UNIT as the source: the unit deals it, NOT in addition to the
 * spell), 417.6.a (no source named → the spell is the source), 417.6.b.4 / 428.5.c.1 (the source's
 * controller is responsible; kills attributed accordingly), 713 / 715.2 (bonus per instance for
 * multi-target deals), 715.3 (bonus would enlarge a split pool — only if it applies at all), 355.14.c
 * (number of split targets ≤ damage available when played), 355.14.f (each target ≥ 1).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ALPHA_STRIKE = "unl-192-219";
const VOID_GATE = "ogn-296-298";
const FIRESTORM = "ogs-002-024";
const RECRUIT = "ogn-272-298"; // 1-Might unit token

/**
 * P1's turn. bf1 = a LIVE Void Gate held by P2 with tokens t1..t3 (1 Might) and Big (3 Might).
 * P1: 3-Might F in base; Alpha Strike (3+[rainbow]) and Firestorm (6+[fury]) in hand; exactly 9 energy,
 * 1 rainbow, 1 fury.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { fury: 1, rainbow: 1 } })
    .battlefield("bf1", { controller: P2, def: VOID_GATE, inert: false, owner: P2 })
    .unit(P1, "base", { might: 3, name: "F" }, "f")
    .unit(P2, "bf1", RECRUIT, "t1")
    .unit(P2, "bf1", RECRUIT, "t2")
    .unit(P2, "bf1", RECRUIT, "t3")
    .unit(P2, "bf1", { might: 3, name: "Big" }, "big")
    .hand(P1, ALPHA_STRIKE, "alpha")
    .hand(P1, FIRESTORM, "storm");
}

/** The `[source, ...splitTargets]` tuples Alpha Strike may be cast with right now. */
function alphaTuples(game: Game): string[][] {
  const field = game.p1.option("cast", "alpha")?.fields.find((f) => f.name === "targets");
  return (field?.options ?? []) as string[][];
}

const nonCombatLog = (game: Game) => (game.gameState.damageLog ?? []).filter((r) => !r.combat);
const dealtTo = (game: Game, target: string) => nonCombatLog(game).filter((r) => r.target === target).reduce((n, r) => n + r.amount, 0);

describe("(a) Alpha Strike at Void Gate — the UNIT is the source, so no Bonus Damage anywhere", () => {
  test("finalization: with 3-Might F as the source P1 may name AT MOST 3 enemy units — no 4-target tuple exists (355.14.c; Void Gate does not enlarge the pool via 715.3)", async () => {
    const game = await board().build();
    const tuples = alphaTuples(game);
    expect(tuples.length).toBeGreaterThan(0);
    expect(tuples.every((t) => t[0] === "f")).toBe(true);
    expect(Math.max(...tuples.map((t) => t.length - 1))).toBe(3);
    expect(tuples).toContainEqual(["f", "t1", "t2", "t3"]);
    expect(tuples).not.toContainEqual(["f", "t1", "t2", "t3", "big"]);
    await expect(game.p1.cast("alpha", { targets: ["f", "t1", "t2", "t3", "big"] })).rejects.toThrow();
    expect(game.zoneOf("alpha")).toBe("hand");
    expect(game.p1.energy()).toBe(9);
  });

  test("naming the three tokens: 3+[rainbow] paid, item shows [F, t1, t2, t3]; at resolution exactly 3 damage is dealt 1/1/1 (forced — no split prompt), total 3, never 4 or 6", async () => {
    const game = await board().build();
    await game.p1.cast("alpha", { targets: ["f", "t1", "t2", "t3"] });
    expect(game.p1.resources()).toEqual({ energy: 6, power: { fury: 1, rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "alpha", controller: P1, targets: ["f", "t1", "t2", "t3"] })]);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // no distribute prompt was left open
    expect(dealtTo(game, "t1")).toBe(1);
    expect(dealtTo(game, "t2")).toBe(1);
    expect(dealtTo(game, "t3")).toBe(1);
    expect(dealtTo(game, "big")).toBe(0);
    expect(nonCombatLog(game).reduce((n, r) => n + r.amount, 0)).toBe(3);
    // No record carries a Void Gate bonus note.
    expect(nonCombatLog(game).every((r) => r.modifiedBy.length === 0 && r.amount === r.original)).toBe(true);
  });

  test("all three tokens die (1 ≥ 1 Might each); Big and F untouched; Alpha Strike counts the 3 kills → P1 gains 3 XP", async () => {
    const game = await board().build();
    await game.p1.cast("alpha", { targets: ["f", "t1", "t2", "t3"] });
    await game.settle();
    expect(game.zoneOf("t1")).toBe("gone"); // tokens cease to exist
    expect(game.zoneOf("t2")).toBe("gone");
    expect(game.zoneOf("t3")).toBe("gone");
    expect(game.state("big")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("f")).toMatchObject({ damage: 0, might: 3, zone: "base" });
    expect(game.p1.xp()).toBe(3);
    expect(game.p2.xp()).toBe(0);
    expect(game.zoneOf("alpha")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the damage SOURCE is F (kind 'unit'), with P1 responsible — not the spell (417.6.b.3 / 417.6.b.4 / 428.5.c.1)", async () => {
    const game = await board().build();
    await game.p1.cast("alpha", { targets: ["f", "t1", "t2", "t3"] });
    await game.settle();
    const log = nonCombatLog(game);
    expect(log).toHaveLength(3);
    for (const r of log) {
      expect(r.source).toMatchObject({ cardId: "f", kind: "unit", player: P1 });
    }
  });

  test("two targets (t1 + Big): the split prompt's pool is exactly 3 (F's Might, no +1); 1 to t1 / 2 to Big → t1 dies, Big survives on 2 damage (not 3), 1 XP", async () => {
    const game = await board().build();
    await game.p1.cast("alpha", { targets: ["f", "t1", "big"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 3 });
    if (d?.kind === "distribute") {
      expect(d.buckets.map((b) => b.key).sort()).toEqual(["big", "t1"]);
    }
    const r = await game.p1.try((p) => p.distribute({ big: 3, t1: 1 })); // 4 is not available
    expect(r.ok).toBe(false);
    await game.p1.distribute({ big: 2, t1: 1 });
    await game.settle();
    expect(dealtTo(game, "t1")).toBe(1);
    expect(dealtTo(game, "big")).toBe(2);
    expect(game.zoneOf("t1")).toBe("gone");
    expect(game.state("big")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.p1.xp()).toBe(1);
  });
});

describe("(b) contrast — Firestorm at Void Gate: the SPELL is the source, +1 per instance", () => {
  test("Firestorm (6+[fury]) at bf1: every enemy unit there takes 3+1 = 4 (715.2) — all three tokens AND the 3-Might Big die, credited to Firestorm / P1; F in base untouched", async () => {
    const game = await board().build();
    expect((game.p1.option("cast", "storm")?.fields.find((f) => f.name === "targets")?.options ?? []).flat()).toEqual(["bf1"]);
    await game.p1.cast("storm", { targets: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 0, rainbow: 1 } });
    await game.settle();
    const log = nonCombatLog(game);
    expect(log.map((r) => r.target).sort()).toEqual(["big", "t1", "t2", "t3"]);
    for (const r of log) {
      expect(r).toMatchObject({ amount: 4, original: 3, source: { cardId: "storm", kind: "spell", player: P1 } });
      expect(r.modifiedBy).toEqual([expect.objectContaining({ after: 4, before: 3, kind: "bonus" })]);
    }
    expect(game.zoneOf("t1")).toBe("gone");
    expect(game.zoneOf("t2")).toBe("gone");
    expect(game.zoneOf("t3")).toBe("gone");
    expect(game.zoneOf("big")).toBe("trash"); // 4 ≥ 3
    expect(game.state("f")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.p1.xp()).toBe(0); // Firestorm grants no XP
    expect(game.zoneOf("storm")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: the same Firestorm at an INERT bf1 (no Void Gate text) deals plain 3 each — tokens die, Big (3 Might) dies too, but on 3 not 4", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", RECRUIT, "t1")
      .unit(P2, "bf1", { might: 3, name: "Big" }, "big")
      .unit(P2, "bf1", { might: 4, name: "Bigger" }, "bigger")
      .hand(P1, FIRESTORM, "storm")
      .build();
    await game.p1.cast("storm", { targets: "bf1" });
    await game.settle();
    for (const r of nonCombatLog(game)) {
      expect(r).toMatchObject({ amount: 3, original: 3 });
      expect(r.modifiedBy).toEqual([]);
    }
    expect(game.zoneOf("t1")).toBe("gone");
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.state("bigger")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
  });
});
