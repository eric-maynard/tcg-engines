/**
 * Interaction: Volibear, Furious (ogn-041-298) · Champion Unit · Fury · 10 · 9 Might
 *     "[Deflect 2] When I attack, deal 5 damage split among any number of enemy units here."
 *   × Recruit (NX) token (ogn-272-298) · 1 Might ×5
 *   × Vanguard Sergeant (ogn-219-298) · 4 Might
 *
 * Question: Volibear attacks bf1 where P2 has SIX defenders (five Recruits + the Sergeant). When the
 * attack trigger finalizes:
 *   (a) may P1 pick all six units? five? one?
 *   (b) does the finalize-time prompt ask only WHICH units, with no per-unit amounts?
 *   (c) with 3 targets (Sergeant + 2 Recruits) locked and no responses, does a SECOND Decision appear
 *       at resolution asking for the split; which vectors are legal (3/1/1, 2/2/1 …; 5/0/0? 4/1/0?)
 *   (d) with exactly 5 targets locked, is the resolution split forced to 1/1/1/1/1?
 *
 * Rules: 355.14.b (split targets are chosen at FINALIZATION), 355.14.c (their number may not exceed
 * the damage available: 5), 355.13 ("any number"), 355.14.e (the division is decided only at
 * RESOLUTION), 355.14.f / 355.14.g / 417.1.e (each target must receive a positive integer ≥ 1).
 *
 * Engine: the trigger's finalize-time Decision is a target-SET `pick` (timing FIN, min 0, max 5, no
 * amounts); the locked set rides on the chain item. At resolution a `distribute` Decision divides
 * exactly 5 among the still-legal locked targets (each bucket min 1); a single locked target takes the
 * whole 5 without a prompt.
 */
import { describe, expect, test } from "bun:test";
import type { DistributeDecision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOLIBEAR = "ogn-041-298";
const RECRUIT = "ogn-272-298";
const VANGUARD_SERGEANT = "ogn-219-298";

const RECRUITS = ["r1", "r2", "r3", "r4", "r5"] as const;
const DEFENDERS = [...RECRUITS, "sarge"] as const;

/** P1's turn. P2 holds bf1 with five Recruit tokens (1) and a Vanguard Sergeant (4); Volibear (9) ready in P1's base. */
function board() {
  let s = scenario().battlefield("bf1", { controller: P2 });
  for (const r of RECRUITS) {
    s = s.unit(P2, "bf1", RECRUIT, r);
  }
  return s.unit(P2, "bf1", VANGUARD_SERGEANT, "sarge").unit(P1, "base", VOLIBEAR, "voli");
}

/** Answer the finalize-time target-set question (355.14.b) with `targets`. */
async function lockIfAsked(game: Game, targets: readonly string[]): Promise<void> {
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", timing: "FIN" });
  await game.p1.pick(...targets);
}

/**
 * Volibear attacks bf1 locking `targets`; both pass on the trigger; returns the game parked on P1's split
 * Decision (a single locked target takes everything without one — `d` is then undefined).
 */
async function atSplit(targets: readonly string[] = DEFENDERS.slice(0, 5)): Promise<{ game: Game; d: DistributeDecision }> {
  const game = await board().build();
  await game.p1.move("voli", "bf1");
  await lockIfAsked(game, targets);
  await game.p1.passPriority();
  await game.p2.passPriority(); // both pass → the trigger resolves (into its split prompt)
  const d = game.decision();
  if (targets.length >= 2) {
    expect(d).toMatchObject({ kind: "distribute", seat: P1, source: { cardId: "voli" } });
  } else {
    expect(d?.kind).not.toBe("distribute"); // one recipient: nothing to divide (355.14.e/f)
  }
  return { d: d as DistributeDecision, game };
}

describe("Volibear, Furious — 'deal 5 split among any number of enemy units here' into six defenders", () => {
  test("Volibear's Standard Move into bf1 opens the combat and puts his 'When I attack' trigger on the chain; both players get priority on it", async () => {
    const game = await board().build();
    await game.p1.move("voli", "bf1");
    await lockIfAsked(game, ["sarge"]);
    expect(game.state("voli").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", controller: P1, triggered: true, type: "ability" })]);
    expect(game.p2.units("bf1").sort()).toEqual([...DEFENDERS].sort());
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  // Expected (355.14.b, 355.13, 355.14.c): as the trigger is finalized — before anyone receives
  // priority — P1 is asked WHICH enemy units here are targets: a pure target-set pick (no amounts,
  // 355.14.e) over the six defenders, choosing any number up to 5; the chain item then shows the
  // locked targets. Actual: no finalize-time choice exists; the item has no targets and P1 goes
  // straight to a priority window.
  test("(a)(b) finalize-time Decision is a target-SET pick over the six enemy units, max 5, no amounts; the locked set is visible on the chain item (355.14.b/c/e)", async () => {
    const game = await board().build();
    await game.p1.move("voli", "bf1");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", timing: "FIN" });
    if (d?.kind !== "pick") {
      return;
    }
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual([...DEFENDERS].sort());
    expect(d.max).toBe(5); // never all six (355.14.c)
    expect(d.min).toBe(0); // "any number" (355.13)
    await lockIfAsked(game, ["sarge", "r1", "r2"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", targets: expect.arrayContaining(["sarge", "r1", "r2"]) })]);
    expect(game.chain()[0]?.targets).toHaveLength(3);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // only now priority
  });

  test("(c) the SPLIT itself is decided only at resolution: after both pass, a distinct resolution-time `distribute` Decision for P1 (controller of the damage) asks how to divide exactly 5 (355.14.e)", async () => {
    const game = await board().build();
    await game.p1.move("voli", "bf1");
    await lockIfAsked(game, ["sarge", "r1", "r2"]);
    expect(game.decision()?.kind).not.toBe("distribute"); // not while it is merely on the chain
    await game.p1.passPriority();
    expect(game.decision()?.kind).not.toBe("distribute");
    await game.p2.passPriority(); // resolves
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, timing: "RES", total: 5, source: { cardId: "voli" } });
    expect(game.chain()).toEqual([]); // being resolved, nothing else pending
    for (const u of DEFENDERS) {
      expect(game.state(u).damage).toBe(0); // nothing dealt before the split is named
    }
  });

  test("(a) all SIX can never be hit — six targets would need ≥1 each = 6 > 5 (355.14.c, 355.14.f): choosing all six is rejected at finalization and nothing is dealt", async () => {
    const game = await board().build();
    await game.p1.move("voli", "bf1");
    const fin = game.decision();
    expect(fin).toMatchObject({ kind: "pick", seat: P1, semantics: "target", timing: "FIN" });
    if (fin?.kind !== "pick") {
      return;
    }
    // The cap bites at finalization.
    expect(fin.options.map((o) => o.card ?? o.key).sort()).toEqual([...DEFENDERS].sort());
    expect(fin.max).toBe(5);
    expect((await game.p1.try((p) => p.pick(...DEFENDERS))).ok).toBe(false);
    expect(game.decision()?.kind).toBe("pick"); // still waiting for a legal set
    for (const u of DEFENDERS) {
      expect(game.state(u).damage).toBe(0);
    }
  });

  test("(a) FIVE targets (1 each to the five Recruits) is legal — all five tokens cease to exist before any combat damage; the Sergeant is untouched (355.14.c, 355.13)", async () => {
    const { game } = await atSplit();
    await game.p1.distribute({ r1: 1, r2: 1, r3: 1, r4: 1, r5: 1 });
    for (const r of RECRUITS) {
      expect(game.zoneOf(r)).toBe("gone"); // token left the board (186.1)
    }
    expect(game.state("sarge")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" }); // still before the damage step
    expect(game.state("voli").damage).toBe(0);
  });

  test("(a) ONE target is legal — the whole 5 lands on it without a split prompt: a single Recruit (overkill is fine) or the Sergeant (dies: 5 ≥ 4)", async () => {
    const one = await atSplit(["r3"]);
    expect(one.game.zoneOf("r3")).toBe("gone");
    expect(RECRUITS.filter((r) => one.game.zoneOf(r) === "battlefield-bf1")).toHaveLength(4);
    expect(one.game.state("sarge").damage).toBe(0);

    const boss = await atSplit(["sarge"]);
    expect(boss.game.zoneOf("sarge")).toBe("trash");
    expect(RECRUITS.every((r) => boss.game.zoneOf(r) === "battlefield-bf1")).toBe(true);
  });

  test("(c) 3 to the Sergeant, 1 + 1 to two Recruits: both Recruits die, the Sergeant carries 3 damage into combat (355.14.f)", async () => {
    const { game } = await atSplit(["sarge", "r1", "r2"]);
    await game.p1.distribute({ r1: 1, r2: 1, sarge: 3 });
    expect(game.zoneOf("r1")).toBe("gone");
    expect(game.zoneOf("r2")).toBe("gone");
    expect(game.state("sarge")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    for (const r of ["r3", "r4", "r5"]) {
      expect(game.state(r)).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" }); // combat damage not yet dealt
    expect(game.violations()).toEqual([]);
  });

  test("(c) 2/2/1 and 1/1/3 over {Sergeant, Recruit, Recruit} are equally legal splits of 5; a split that does not use all 5 (Sergeant 3, nothing else) is rejected", async () => {
    const a = await atSplit(["sarge", "r1", "r2"]);
    await a.game.p1.distribute({ r1: 2, r2: 1, sarge: 2 });
    expect(a.game.zoneOf("r1")).toBe("gone");
    expect(a.game.zoneOf("r2")).toBe("gone");
    expect(a.game.state("sarge").damage).toBe(2);

    const b = await atSplit(["sarge", "r1", "r2"]);
    await b.game.p1.distribute({ r1: 1, r2: 3, sarge: 1 });
    expect(b.game.zoneOf("r1")).toBe("gone");
    expect(b.game.zoneOf("r2")).toBe("gone");
    expect(b.game.state("sarge").damage).toBe(1);

    const c = await atSplit(["sarge", "r1", "r2"]);
    const under = await c.game.p1.try((p) => p.distribute({ sarge: 3 }));
    expect(under.ok).toBe(false);
    expect(c.game.decision()?.kind).toBe("distribute");
  });

  // 355.14.b + 355.14.f/g: with {Sergeant, r1, r2} LOCKED at finalization, the resolution Decision
  // offers exactly those three buckets, each min 1 — so 5/0/0 and 4/1/0 are not legal answers (a
  // locked target may not be given 0), while 3/1/1 · 1/3/1 · 1/1/3 · 2/2/1 · 2/1/2 · 1/2/2 are.
  test("(c) with three targets locked the resolution Decision has exactly 3 buckets, each ≥ 1 — 4/1/0 and 5/0/0 are rejected (355.14.b, 355.14.f/g)", async () => {
    const game = await board().build();
    await game.p1.move("voli", "bf1");
    await lockIfAsked(game, ["sarge", "r1", "r2"]);
    await game.settle(); // both pass → resolution
    const d = game.decision();
    expect(d?.kind).toBe("distribute");
    if (d?.kind !== "distribute") {
      return;
    }
    expect(d.total).toBe(5);
    expect(d.buckets.map((b) => b.card).sort()).toEqual(["r1", "r2", "sarge"]);
    expect(d.buckets.every((b) => b.min === 1 && b.max === 3)).toBe(true); // 5 − (1+1) = 3 at most on any one
    expect((await game.p1.try((p) => p.distribute({ r1: 1, r2: 0, sarge: 4 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.distribute({ r1: 0, r2: 0, sarge: 5 }))).ok).toBe(false);
    await game.p1.distribute({ r1: 1, r2: 1, sarge: 3 });
    expect(game.state("sarge").damage).toBe(3);
  });

  // 355.14.c + 355.14.f: five locked targets and 5 damage ⇒ the only legal vector is 1/1/1/1/1 —
  // the resolution Decision has five buckets pinned to exactly 1.
  test("(d) with the five Recruits locked the resolution split is forced to 1/1/1/1/1 (each bucket min 1 = max 1)", async () => {
    const game = await board().build();
    await game.p1.move("voli", "bf1");
    await lockIfAsked(game, RECRUITS);
    await game.settle();
    const d = game.decision();
    if (d?.kind === "distribute") {
      expect(d.buckets.map((b) => b.card).sort()).toEqual([...RECRUITS]);
      expect(d.buckets.every((b) => b.min === 1 && b.max === 1)).toBe(true);
      expect((await game.p1.try((p) => p.distribute({ r1: 5 }))).ok).toBe(false);
      await game.p1.distribute({ r1: 1, r2: 1, r3: 1, r4: 1, r5: 1 });
    }
    // Whether asked or auto-applied, the outcome is fixed: all five Recruits are gone, Sergeant untouched.
    for (const r of RECRUITS) {
      expect(game.zoneOf(r)).toBe("gone");
    }
    expect(game.state("sarge").damage).toBe(0);
  });

  test("(d) epilogue: after 1/1/1/1/1 wipes the Recruits, combat is Volibear 9 vs Sergeant 4 — Sergeant dies, Volibear (4 < 9) survives healed and conquers bf1 for 1 point", async () => {
    const { game } = await atSplit();
    await game.p1.distribute({ r1: 1, r2: 1, r3: 1, r4: 1, r5: 1 });
    await game.settle(); // both pass focus → combat damage → resolution
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.zoneOf("voli")).toBe("battlefield-bf1");
    expect(game.state("voli")).toMatchObject({ combatRole: null, damage: 0 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
