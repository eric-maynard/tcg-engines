/**
 * Ruling 6b3effc73787ce91 — Alpha Strike (UNL-192 → unl-192-219) · Spell · Calm/Body · 3+[rainbow] · Action
 *   "[Action] Choose a friendly unit. It deals damage equal to its Might split among enemy units at
 *    battlefields. Then for each unit this kills, do this: Gain 1 XP."
 *
 * Q: How are targets chosen when playing Alpha Strike?
 * A: At finalization choose the friendly unit (a standard target), then choose up to one enemy unit AT A
 *    BATTLEFIELD per point of its current Might as split targets — fewer is fine, including zero. Each chosen
 *    enemy is a target, so [Deflect] on any of them adds its mandatory extra cost. All choices are locked at
 *    finalization; only the division of the damage waits for resolution.
 *    Example: friendly unit with 4 Might → up to 4 enemy units; choosing 3 locks those 3 + the friendly unit.
 * Rules: 355.14.a–c, 355.14.e, 356.2.a.2 / 809.1.d (Deflect), 355.15 (locked at finalization).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ALPHA_STRIKE = "unl-192-219";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn with 5 energy / 3 rainbow (Alpha Strike is 3+[rainbow]; one spare rainbow can pay a Deflect).
 * P1: Champ (4 Might) and Small (1 Might) in base. P2: five units at battlefields — E1, E2 at bf1; E3, E4
 * (2 Might, [Deflect]) and E5 at bf2 — plus EBase in P2's base (not "at a battlefield").
 */
function board(p1: { energy?: number; rainbow?: number } = {}) {
  return scenario()
    .resources(P1, { energy: p1.energy ?? 5, power: { rainbow: p1.rainbow ?? 3 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Champ" }, "champ")
    .unit(P1, "base", { might: 1, name: "Small" }, "small")
    .unit(P2, "bf1", { might: 1, name: "E1" }, "e1")
    .unit(P2, "bf1", { might: 1, name: "E2" }, "e2")
    .unit(P2, "bf2", { might: 1, name: "E3" }, "e3")
    .unit(P2, "bf2", { keywords: ["Deflect"], might: 2, name: "E4" }, "e4")
    .unit(P2, "bf2", { might: 1, name: "E5" }, "e5")
    .unit(P2, "base", { might: 1, name: "EBase" }, "ebase")
    .hand(P1, ALPHA_STRIKE, "alpha");
}

/** Every legal target tuple for casting Alpha Strike: [friendly, ...enemies]. */
function targetTuples(game: Game): string[][] {
  const field = game.p1.option("cast", "alpha")?.fields.find((f) => f.name === "targets");
  return (field?.options ?? []).map((v) => (Array.isArray(v) ? [...(v as string[])] : [v as string]));
}

/** Answer any resolution-time "assign damage" prompts by feeding one point at a time to `order` (cycled). */
async function distributeTo(game: Game, order: readonly string[]): Promise<void> {
  let n = 0;
  for (let i = 0; i < 12; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "distribute") {
      return;
    }
    expect(d.seat).toBe(P1);
    const key = order[n++ % order.length] as string;
    expect(d.buckets.map((b) => b.key)).toContain(key);
    await game.p1.distribute({ [key]: 1 });
  }
}

describe("Ruling 6b3effc73787ce91 — how Alpha Strike's targets are chosen", () => {
  test("the FIRST choice is the friendly unit: every offered tuple starts with Champ or Small, never an enemy", async () => {
    const game = await board().build();
    const tuples = targetTuples(game);
    expect(tuples.length).toBeGreaterThan(0);
    for (const t of tuples) {
      expect(["champ", "small"]).toContain(t[0] as string);
      for (const rest of t.slice(1)) {
        expect(["e1", "e2", "e3", "e4", "e5"]).toContain(rest); // enemy units AT BATTLEFIELDS only
      }
    }
    expect(tuples.flat()).not.toContain("ebase"); // P2's base unit is never a split target
  });

  test("up to ONE enemy unit per point of the friendly unit's current Might: Champ (4) → at most 4 of the 5 enemies; Small (1) → at most 1 (355.14.c)", async () => {
    const game = await board().build();
    const tuples = targetTuples(game);
    const champMax = Math.max(...tuples.filter((t) => t[0] === "champ").map((t) => t.length - 1));
    const smallMax = Math.max(...tuples.filter((t) => t[0] === "small").map((t) => t.length - 1));
    expect(champMax).toBe(4);
    expect(smallMax).toBe(1);
    expect(tuples.some((t) => t[0] === "champ" && t.length - 1 === 5)).toBe(false);
    await expect(game.p1.cast("alpha", { targets: ["small", "e1", "e2"] })).rejects.toThrow(); // 2 > Small's 1 Might
    expect(game.zoneOf("alpha")).toBe("hand");
  });

  test("you may choose FEWER enemies than the Might allows, including zero: [Champ] alone and [Champ + 3 of 4] are both legal", async () => {
    const game = await board().build();
    const keys = targetTuples(game).map((t) => t.join(","));
    expect(keys).toContain("champ");
    expect(keys).toContain("champ,e1,e2,e3");
    expect(keys).toContain("small");
  });

  test("the ruling's example: friendly 4-Might unit, choose 3 enemies → pays 3+[rainbow]; those 3 (and only those) take the 4 damage, each at least 1; E4/E5/EBase untouched (355.14.b, 355.14.e/f, 355.15)", async () => {
    const game = await board().build();
    await game.p1.cast("alpha", { targets: ["champ", "e1", "e2", "e3"] });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 2 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "alpha", controller: P1 })]);
    // Nothing is dealt before resolution; the split itself is decided only on resolution.
    expect(game.state("e1").damage + game.state("e2").damage + game.state("e3").damage).toBe(0);
    await distributeTo(game, ["e1"]); // the one discretionary point (4 might − 3 mandatory minimums) goes to E1
    expect(game.chain()).toEqual([]);
    // 1-Might units with ≥1 damage die; total dealt = 4 = Champ's Might.
    expect(game.zoneOf("e1")).toBe("trash");
    expect(game.zoneOf("e2")).toBe("trash");
    expect(game.zoneOf("e3")).toBe("trash");
    expect(game.state("e4").damage).toBe(0);
    expect(game.state("e5").damage).toBe(0);
    expect(game.state("ebase").damage).toBe(0);
    expect(game.zoneOf("e4")).toBe("battlefield-bf2");
    expect(game.zoneOf("alpha")).toBe("trash");
  });

  test("choices are locked at finalization: with the spell on the chain P2 gets priority, and the only later question for P1 is how to divide the damage among the ALREADY-chosen targets (355.15, 355.14.e)", async () => {
    const game = await board().build();
    await game.p1.cast("alpha", { targets: ["champ", "e1", "e3", "e5"] });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || d.kind === "action") {
        break;
      }
      expect(d.kind).toBe("distribute"); // never a fresh target pick
      if (d.kind !== "distribute") {
        break;
      }
      expect(d.buckets.map((b) => b.key).sort()).toEqual(["e1", "e3", "e5"]);
      await game.p1.distribute({ e3: 1 });
    }
    expect(game.state("e2").damage).toBe(0);
    expect(game.state("e4").damage).toBe(0);
    expect(game.zoneOf("e2")).toBe("battlefield-bf1");
  });

  test("[Deflect] on a chosen split target is a mandatory additional cost: including E4 costs one extra [rainbow] (5E/3R → 2E/1R), excluding it does not (→ 2E/2R) (356.2.a.2, 809.1.d)", async () => {
    const withDeflect = await board().build();
    await withDeflect.p1.cast("alpha", { targets: ["champ", "e1", "e4"] });
    expect(withDeflect.p1.resources()).toEqual({ energy: 2, power: { rainbow: 1 } });
    const without = await board().build();
    await without.p1.cast("alpha", { targets: ["champ", "e1", "e5"] });
    expect(without.p1.resources()).toEqual({ energy: 2, power: { rainbow: 2 } });
  });

  test("[Deflect] cost must be affordable at finalization: with exactly 3E/1R no tuple containing E4 is offered, but the other enemies still are", async () => {
    const game = await board({ energy: 3, rainbow: 1 }).build();
    const tuples = targetTuples(game);
    expect(tuples.length).toBeGreaterThan(0);
    expect(tuples.some((t) => t.includes("e4"))).toBe(false);
    expect(tuples.some((t) => t.includes("e5"))).toBe(true);
    await expect(game.p1.cast("alpha", { targets: ["champ", "e4"] })).rejects.toThrow();
  });

  // Expected (355.14.a/c): only CHOSEN enemy units are targets — choosing zero split targets means the spell
  // resolves dealing no damage to anyone. Actual: when cast with the friendly unit alone the engine falls
  // back to damaging every enemy unit at a battlefield (E1–E3 die, E4 takes 1).
  test("ruling 6b3effc73787ce91 — choosing ZERO enemy units is legal and then nothing is damaged", async () => {
    const game = await board().build();
    await game.p1.cast("alpha", { targets: "champ" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 2 } });
    await distributeTo(game, ["e1"]);
    await game.settle();
    for (const u of ["e1", "e2", "e3", "e4", "e5", "ebase"]) {
      expect(game.zoneOf(u)).not.toBe("trash");
      expect(game.state(u).damage).toBe(0);
    }
    expect(game.zoneOf("alpha")).toBe("trash");
  });
});
