/**
 * Interaction: Volibear, Furious (ogn-041-298) · Champion Unit · Fury · 10 · 9 Might
 *                "[Deflect 2] When I attack, deal 5 damage split among any number of enemy units here."
 *            × Rabadon's Deathcrown (sfd-191-221) · Equipment · 4 · +3 Might
 *                "[Equip] [rainbow]. Your spells and abilities deal 3 Bonus Damage (while this is attached)."
 *                — ATTACHED to Volibear
 *            × Annie, Fiery (ogs-001-024) · Champion Unit · Fury · 5 · 4 Might
 *                "Your spells and abilities deal 1 Bonus Damage."  — in P1's base
 *   vs P2's bf1: four vanilla 2-Might units.
 *
 * Question: (a) When Volibear attacks bf1, what is the split pool — 5, 6, 8 or 9? Is the bonus added once to the pool
 * or per chosen target? How many targets may P1 name at finalization? (b) P1 names all four and splits 3/2/2/2 —
 * legal? What dies? (c) Does Volibear's subsequent COMBAT damage also get +4?
 *
 * Rules: 417.6.b.2.a (the ability — with Volibear — is the source; no other source is named), 713 / 714 (Bonus
 * Damage instances are SUMMED: 1 + 3 = 4, applied once), 715.3 (a split adds the bonus once to the amount to be split
 * and raises the target cap; the CR example is literally Volibear + Annie), 355.14.c (targets ≤ damage available),
 * 355.14.f (each target ≥ 1, all damage assigned), 417.6.c (combat damage has the units as source → no bonus).
 *
 * Expected: (a) pool 9 (5 + 4 once), never 5 + 4×targets; cap 9 → all four choosable. (b) 3/2/2/2 = 9 legal; all four
 * 2-Might units die in the Cleanup; marked damage sums to exactly 9. (c) No: combat damage is unit-sourced (here 12 =
 * 9 + Deathcrown's +3 Might, not 16); with no defenders left there is no combat damage step and Volibear conquers.
 */
import { describe, expect, test } from "bun:test";
import type { DistributeDecision, Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOLIBEAR = "ogn-041-298";
const DEATHCROWN = "sfd-191-221";
const ANNIE = "ogs-001-024";
const ENEMIES = ["e1", "e2", "e3", "e4"] as const;

/** P1's turn. P2 holds bf1 with four 2-Might units. P1: Volibear (ready, base) wearing Deathcrown; Annie in base (toggle). */
function board(opts: { annie?: boolean; crown?: boolean } = {}) {
  const annie = opts.annie ?? true;
  const crown = opts.crown ?? true;
  let s = scenario().battlefield("bf1", { controller: P2 });
  for (const e of ENEMIES) {
    s = s.unit(P2, "bf1", { might: 2, name: `Enemy ${e}` }, e);
  }
  s = crown
    ? s
        .unit(P1, "base", VOLIBEAR, "voli", { equippedWith: ["crown"] })
        .card("crown", { def: DEATHCROWN, meta: { attachedTo: "voli" }, owner: P1, zone: "base" })
    : s.unit(P1, "base", VOLIBEAR, "voli");
  return annie ? s.unit(P1, "base", ANNIE, "annie") : s;
}

/** Volibear attacks bf1 → the trigger's finalization-time target-SET pick (355.14.b). */
async function attack(game: Game): Promise<PickDecision> {
  await game.p1.move("voli", "bf1");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "voli" }, targeting: "split-targets", timing: "FIN" });
  return d as PickDecision;
}

/** …name `targets`, pass priority both ways → the trigger resolves into its `distribute` prompt (≥2 targets). */
async function attackAndName(game: Game, targets: readonly string[] = ENEMIES): Promise<DistributeDecision> {
  await attack(game);
  await game.p1.pick(...targets);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", controller: P1, targets: [...targets], triggered: true, type: "ability" })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "distribute", seat: P1, source: { cardId: "voli" } });
  return d as DistributeDecision;
}

type DamageLogEntry = { amount: number; combat: boolean; source: { kind: string; cardId?: string; player?: string }; target: string };
const damageLog = (game: Game): DamageLogEntry[] => ((game.gameState as unknown as { damageLog?: DamageLogEntry[] }).damageLog ?? []);

describe("Volibear + attached Deathcrown + Annie — Bonus Damage instances sum (+4) and go into the split pool ONCE (9)", () => {
  test("premise: Deathcrown is attached to Volibear and moves with him; both grants are live — Volibear carries BonusDamage 3 (12 Might with the crown's +3), Annie BonusDamage 1", async () => {
    const game = await board().build();
    expect(game.state("crown")).toMatchObject({ attachedTo: "voli", controller: P1, zone: "base" });
    expect(game.state("voli")).toMatchObject({ attachments: ["crown"], baseMight: 9, might: 12 });
    expect(game.state("voli").grantedKeywords).toContainEqual({ duration: "static", keyword: "BonusDamage", value: 3 });
    expect(game.state("annie").grantedKeywords).toContainEqual({ duration: "static", keyword: "BonusDamage", value: 1 });
    await attack(game);
    expect(game.state("crown")).toMatchObject({ attachedTo: "voli", zone: "battlefield-bf1" });
    expect(game.state("voli")).toMatchObject({ combatRole: "attacker", location: "bf1" });
  });

  // ---------------------------------------------------------------- (a) pool and target cap

  test("(a) at finalization all FOUR enemy units here are offered and all four may be named (cap = 9 ≥ 4 candidates, 355.14.c as modified by 715.3); Annie/Volibear are not candidates", async () => {
    const game = await board().build();
    const d = await attack(game);
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual([...ENEMIES]);
    expect(d.min).toBe(0); // "any number of"
    expect(d.max).toBe(4);
    await game.p1.pick(...ENEMIES);
    expect(game.chain()[0]?.targets).toEqual([...ENEMIES]);
  });

  test("(a) the split POOL is 9 = 5 + (1 + 3) added ONCE (714 sum, 715.3) — not 5, 6 or 8; each of the four buckets is 1..6 (the other three need ≥ 1 each, 355.14.f)", async () => {
    const game = await board().build();
    const d = await attackAndName(game);
    expect(d.total).toBe(9);
    expect(d.buckets.map((b) => [b.card, b.min, b.max])).toEqual(ENEMIES.map((e) => [e, 1, 6]));
  });

  test("(a) the cap really is the bonus-inflated pool: against SEVEN 1-Might enemies Volibear+crown+Annie may name up to 7 (≤ 9), while a bare Volibear is capped at the printed 5 (355.14.c)", async () => {
    const seven = (s: ReturnType<typeof scenario>) => {
      let b = s.battlefield("bf1", { controller: P2 });
      for (let i = 0; i < 7; i++) {
        b = b.unit(P2, "bf1", { might: 1, name: `Minion ${i}` }, `m${i}`);
      }
      return b;
    };
    const boosted = await seven(scenario())
      .unit(P1, "base", VOLIBEAR, "voli", { equippedWith: ["crown"] })
      .card("crown", { def: DEATHCROWN, meta: { attachedTo: "voli" }, owner: P1, zone: "base" })
      .unit(P1, "base", ANNIE, "annie")
      .build();
    expect((await attack(boosted)).max).toBe(7);
    const bare = await seven(scenario()).unit(P1, "base", VOLIBEAR, "voli").build();
    expect((await attack(bare)).max).toBe(5);
  });

  test("(a) the bonus is NOT added per chosen target: 5 + 4×4 = 21 (or 8/target readings) are rejected — an allocation summing to more than 9 is illegal", async () => {
    const game = await board().build();
    await attackAndName(game);
    const r = await game.p1.try((p) => p.distribute({ e1: 6, e2: 5, e3: 5, e4: 5 })); // 21
    expect(r.ok).toBe(false);
    const r2 = await game.p1.try((p) => p.distribute({ e1: 3, e2: 3, e3: 2, e4: 2 })); // 10
    expect(r2.ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "distribute", total: 9 }); // still asking
    for (const e of ENEMIES) {
      expect(game.state(e).damage).toBe(0);
    }
  });

  // ---------------------------------------------------------------- (b) 3/2/2/2

  test("(b) 3/2/2/2 is a legal distribution of 9: all four 2-Might units take lethal damage and die in the Cleanup (P2's trash); the ability dealt exactly 9 in total, sourced to Volibear's ability / P1", async () => {
    const game = await board().build();
    await attackAndName(game);
    await game.p1.distribute({ e1: 3, e2: 2, e3: 2, e4: 2 });
    for (const e of ENEMIES) {
      expect(game.zoneOf(e)).toBe("trash");
      expect(game.state(e).owner).toBe(P2);
    }
    const dealt = damageLog(game).filter((x) => !x.combat);
    expect(dealt.map((x) => [x.target, x.amount])).toEqual([
      ["e1", 3],
      ["e2", 2],
      ["e3", 2],
      ["e4", 2],
    ]);
    expect(dealt.reduce((n, x) => n + x.amount, 0)).toBe(9);
    expect(dealt.every((x) => x.source.kind === "ability" && x.source.cardId === "voli" && x.source.player === P1)).toBe(true);
    expect(game.chain()).toEqual([]);
    // still in the showdown (Focus) — this all happened before any combat damage step
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.violations()).toEqual([]);
  });

  test("(b) an uneven legal split 6/1/1/1 (= 9): e1 dies, the units assigned 1 survive with exactly 1 marked — the bonus is not re-added per target (715 / 715.3)", async () => {
    const game = await board().build();
    await attackAndName(game);
    await game.p1.distribute({ e1: 6, e2: 1, e3: 1, e4: 1 });
    expect(game.zoneOf("e1")).toBe("trash");
    for (const e of ["e2", "e3", "e4"]) {
      expect(game.state(e)).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    }
  });

  test("(b) contrast — WITHOUT Annie and WITHOUT the crown the pool is the printed 5: 3/2/2/2 is illegal, 2/1/1/1 is legal", async () => {
    const game = await board({ annie: false, crown: false }).build();
    const d = await attackAndName(game);
    expect(d.total).toBe(5);
    expect((await game.p1.try((p) => p.distribute({ e1: 3, e2: 2, e3: 2, e4: 2 }))).ok).toBe(false);
    await game.p1.distribute({ e1: 2, e2: 1, e3: 1, e4: 1 });
    expect(game.zoneOf("e1")).toBe("trash");
    expect(game.state("e2").damage).toBe(1);
  });

  test("(b) contrast — crown only (no Annie) → pool 8; Annie only (no crown) → pool 6: each grant counts once and they sum", async () => {
    const crownOnly = await board({ annie: false }).build();
    expect((await attackAndName(crownOnly)).total).toBe(8);
    const annieOnly = await board({ crown: false }).build();
    expect((await attackAndName(annieOnly)).total).toBe(6);
  });

  // ---------------------------------------------------------------- (c) combat damage

  test("(c) after 3/2/2/2 no defenders remain → no combat damage step; Volibear takes nothing and conquers bf1 for a point", async () => {
    const game = await board().build();
    await attackAndName(game);
    await game.p1.distribute({ e1: 3, e2: 2, e3: 2, e4: 2 });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(damageLog(game).filter((x) => x.combat)).toEqual([]);
    expect(game.state("voli")).toMatchObject({ damage: 0, location: "bf1", zone: "battlefield-bf1" });
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("(c) Volibear's COMBAT damage gets no Bonus Damage (417.6.c — units are the source): vs a 22-Might wall the trigger deals 9 (single target, whole pool) and combat deals exactly 12 (9 + crown's +3 Might) → 21 < 22, the wall survives; a +4-inflated 16 would have killed it", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 22, name: "Wall" }, "wall")
      .unit(P1, "base", VOLIBEAR, "voli", { equippedWith: ["crown"] })
      .card("crown", { def: DEATHCROWN, meta: { attachedTo: "voli" }, owner: P1, zone: "base" })
      .unit(P1, "base", ANNIE, "annie")
      .build();
    const d = await attack(game);
    expect(d.options.map((o) => o.card)).toEqual(["wall"]);
    await game.p1.pick("wall");
    await game.p1.passPriority();
    await game.p2.passPriority(); // lone target: whole pool, no distribute prompt
    expect(game.decision()?.kind).not.toBe("distribute");
    expect(game.state("wall").damage).toBe(9);
    await game.settle(); // combat: 12 into the wall, 22 into Volibear
    const combat = damageLog(game).filter((x) => x.combat);
    expect(combat).toContainEqual(expect.objectContaining({ amount: 12, source: expect.objectContaining({ kind: "combat", player: P1 }), target: "wall" }));
    expect(game.zoneOf("voli")).toBe("trash"); // 22 ≥ 12
    expect(game.state("wall")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // 9 + 12 = 21 < 22, healed at combat cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });
});
