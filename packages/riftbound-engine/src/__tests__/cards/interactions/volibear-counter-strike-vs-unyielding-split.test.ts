/**
 * Interaction: Volibear, Furious (ogn-041-298) · Champion Unit · Fury · 10 · 9 Might
 *     "[Deflect 2] When I attack, deal 5 damage split among any number of enemy units here."
 *   × Counter Strike (sfd-194-221) · Spell · Calm/Body · 2 + [rainbow] · "[Reaction] Choose a unit. The next
 *     time that unit would be dealt damage this turn, prevent it. Draw 1."
 *   × Unyielding Spirit (ogn-145-298) · Spell · Body · 1 + [body] · "[Reaction] Prevent all spell and ability
 *     damage this turn."
 *   defenders: Vanguard Sergeant (ogn-219-298, 4 Might) + Shipyard Skulker (ogn-175-298, 3 Might), both vanilla.
 *
 * Question: P1's Volibear attacks P2's bf1; the split's targets are Sergeant + Skulker. Case A: P2 reacts with
 * Counter Strike on the Sergeant. At resolution may P1, seeing the shield, go 1 → Sergeant / 4 → Skulker? May P1
 * put 0 on the Sergeant / drop it as a target? Does the Sergeant "take damage"? Case B: P2 reacts with
 * Unyielding Spirit instead. Is the available damage now 0 so 355.14.h strips every target, or does P1 still
 * make a split Decision whose packets are then prevented? Any refund / retarget?
 *
 * Rules: 355.14.a/b (each unit of a split is a target, chosen at finalization), 355.14.e (the division is
 * decided at RESOLUTION), 355.14.f/g (each target must receive valid damage ≥ 1), 355.14.h (targets only cease
 * when targets > available damage), 417.1.e / 417.1.e.1 (only valid damage is dealt — a fully prevented packet
 * was never dealt), 437.2 / 437.2.a (prevented damage is dealt reduced, possibly to 0 = not dealing damage),
 * 437.4, 437.3.a (the one-shot shield is used up), 417.6.c (combat damage is unit-sourced — Unyielding Spirit
 * does not touch it).
 *
 * Expected: Case A — CS resolves first (P2 draws 1). P1 splits with full knowledge: 1 → Sergeant / 4 → Skulker
 * is legal and optimal — Skulker dies; the 1 is prevented to 0, so the Sergeant was dealt no damage (nothing
 * marked/logged) and the shield is consumed (Volibear's 9 combat damage then kills it). 0 on the Sergeant or
 * dropping it is NOT legal (355.14.f/g; 355.14.h needs targets > damage, 2 ≤ 5). Case B — prevention is a
 * replacement at deal time, not a smaller pool: P1 still gets the split Decision (total 5, both targets), any
 * ≥1/≥1 division; every packet is prevented → nobody damaged, nothing dies, no refund, no new prompt. Combat
 * damage then flows normally: 9 kills both defenders (4+3), Volibear takes 7 < 9, survives, conquers bf1.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, DistributeDecision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOLIBEAR = "ogn-041-298";
const COUNTER_STRIKE = "sfd-194-221";
const UNYIELDING_SPIRIT = "ogn-145-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const SHIPYARD_SKULKER = "ogn-175-298";

/** P1's turn. P2 holds bf1 with Sergeant (4) + Skulker (3) and has both Reactions in hand with enough to pay either. */
function board() {
  return scenario()
    .resources(P2, { energy: 3, power: { body: 1, calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", VANGUARD_SERGEANT, "sarge")
    .unit(P2, "bf1", SHIPYARD_SKULKER, "skulker")
    .unit(P1, "base", VOLIBEAR, "voli")
    .hand(P2, COUNTER_STRIKE, "cs")
    .hand(P2, UNYIELDING_SPIRIT, "us");
}

/** Ability-sourced (non-combat) damage records for `target`. */
const abilityDamage = (game: Game, target: string) => (game.gameState.damageLog ?? []).filter((r) => !r.combat && r.target === target);
/** Total combat damage dealt to `target`. */
const combatDamage = (game: Game, target: string) =>
  (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === target).reduce((s, r) => s + r.amount, 0);

/**
 * Volibear attacks bf1 (trigger on the chain, P1 has priority); P1 passes; P2 answers with `reaction`
 * (Counter Strike on the Sergeant / Unyielding Spirit); everyone passes until the trigger asks for its split.
 */
async function attackReactAndReachSplit(game: Game, reaction: "cs" | "us"): Promise<DistributeDecision> {
  await game.p1.move("voli", "bf1");
  await game.p1.pick("sarge", "skulker"); // 355.14.b — the targets are named as the trigger is finalized
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", controller: P1, triggered: true, type: "ability" })]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  expect(game.p2.can("cast", reaction)).toBe(true);
  await (reaction === "cs" ? game.p2.cast("cs", { targets: "sarge" }) : game.p2.cast("us"));
  expect(game.chain().map((c) => c.cardId)).toEqual(["voli", reaction]);
  let d: Decision | null = game.decision();
  for (let i = 0; i < 8 && d?.kind === "action" && d.context === "chain" && d.passKey; i++) {
    await game.acting().passPriority();
    d = game.decision();
  }
  expect(game.zoneOf(reaction)).toBe("trash"); // LIFO: the Reaction resolved before the trigger
  expect(d).toMatchObject({ kind: "distribute", seat: P1, source: { cardId: "voli" } });
  return d as DistributeDecision;
}

/** From inside the showdown after the split: pass focus / take combat assignments until P1's open main phase. */
async function finishCombat(game: Game): Promise<void> {
  await game.settle();
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
}

describe("Volibear's split 5 × Counter Strike (one shielded target) vs Unyielding Spirit (everything prevented)", () => {
  // ---- common ---------------------------------------------------------------------------------------------

  // Expected (355.14.a/b): the units of a split are TARGETS, fixed when the triggered ability is finalized — so
  // before P2 ever gets priority the chain item already names {Sergeant, Skulker} (asked of P1 or, with "any
  // number", locked). Actual: the engine defers the whole choice to resolution; the chain item carries no
  // targets and P1 is asked nothing at finalization.
  test("the split's targets (Sergeant + Skulker) are locked at finalization, visible on the chain before P2 reacts (355.14.a, 355.14.b)", async () => {
    const game = await board().build();
    await game.p1.move("voli", "bf1");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["sarge", "skulker"]);
    await game.p1.pick("sarge", "skulker");
    expect([...(game.chain()[0]?.targets ?? [])].sort()).toEqual(["sarge", "skulker"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("P2 may answer the attack trigger with either Reaction once P1 passes priority; Counter Strike offers P2's own Sergeant/Skulker (Volibear's Deflect is irrelevant to it)", async () => {
    const game = await board().build();
    await game.p1.move("voli", "bf1");
    await game.p1.pick("sarge", "skulker");
    expect(game.p2.can("cast", "cs")).toBe(false); // P1 (controller of the newest item) holds priority first
    await game.p1.passPriority();
    expect(game.p2.can("cast", "cs")).toBe(true);
    expect(game.p2.can("cast", "us")).toBe(true);
    const offered = (game.p2.option("cast", "cs")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("sarge");
    expect(offered).toContain("skulker");
  });

  // ---- Case A: Counter Strike on the Sergeant ---------------------------------------------------------------

  test("Case A: Counter Strike resolves FIRST — P2 drew 1, the Sergeant carries a one-shot 'prevent the next damage' shield, Volibear's trigger is still on the chain awaiting its split", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length; // cs + us
    const d = await attackReactAndReachSplit(game, "cs");
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1); // cast CS, drew 1
    expect(game.state("sarge").meta.preventNextDamageInstance).toBe(true);
    expect(game.state("skulker").meta.preventNextDamageInstance).not.toBe(true);
    expect(d.total).toBe(5);
    expect(d.buckets.map((b) => b.key).sort()).toEqual(["sarge", "skulker"]);
    expect(game.chain().map((c) => c.cardId)).not.toContain("cs"); // (the resolving trigger itself may already be off the list)
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1"); // no split damage dealt yet
  });

  test("Case A: the division is chosen at RESOLUTION with the shield in plain sight — 1 → Sergeant / 4 → Skulker is legal: Skulker (3) dies (355.14.e)", async () => {
    const game = await board().build();
    await attackReactAndReachSplit(game, "cs");
    expect((await game.p1.try((p) => p.distribute({ sarge: 3, skulker: 3 }))).ok).toBe(false); // 6 ≠ 5: the pool is exactly 5
    await game.p1.distribute({ sarge: 1, skulker: 4 });
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.p2.trash()).toContain("skulker");
    expect(abilityDamage(game, "skulker")).toEqual([expect.objectContaining({ amount: 4, source: expect.objectContaining({ cardId: "voli", kind: "ability" }) })]);
    expect(game.chain()).toEqual([]); // the trigger is done — no re-prompt, no leftover
  });

  test("Case A: the 1 assigned to the Sergeant is prevented to 0 → it was dealt NO damage (nothing marked, nothing logged) and Counter Strike's one-shot shield is consumed (437.2.a, 417.1.e.1, 437.3.a)", async () => {
    const game = await board().build();
    await attackReactAndReachSplit(game, "cs");
    await game.p1.distribute({ sarge: 1, skulker: 4 });
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
    expect(game.state("sarge").damage).toBe(0);
    expect(abilityDamage(game, "sarge").filter((r) => r.amount > 0)).toEqual([]);
    expect(game.state("sarge").meta.preventNextDamageInstance).not.toBe(true);
  });

  // Expected: both units are targets of the split; 355.14.f/g demand each receives ≥ 1 and 355.14.h only lets a
  // target "cease" when targets exceed the damage (2 ≤ 5) — so {Skulker 5} / {Sergeant 0, Skulker 5} must be
  // refused. Actual: because the engine picks the target set at resolution, it happily accepts all 5 on the
  // Skulker, letting P1 dodge the shielded Sergeant entirely (and leaving the shield up for combat).
  test("Case A — P1 may NOT assign 0 to the Sergeant or drop it as a target: {skulker 5} is not a legal resolution (355.14.f, 355.14.g, 355.14.h)", async () => {
    const game = await board().build();
    const d = await attackReactAndReachSplit(game, "cs");
    expect(d.buckets.find((b) => b.key === "sarge")?.min).toBe(1);
    expect((await game.p1.try((p) => p.distribute({ sarge: 0, skulker: 5 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.distribute({ skulker: 5 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.distribute({ sarge: 5, skulker: 0 }))).ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1 }); // still waiting for a legal split
  });

  test("Case A: no refund or retarget for anyone — CS in P2's trash with its cost spent, the trigger resolved once, and play continues in the showdown", async () => {
    const game = await board().build();
    const before = game.p2.resources();
    await attackReactAndReachSplit(game, "cs");
    expect(game.p2.energy()).toBe(before.energy - 2);
    expect(game.p2.power()).toBe(Object.values(before.power).reduce((a, b) => a + b, 0) - 1); // the [rainbow] pip
    await game.p1.distribute({ sarge: 1, skulker: 4 });
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.p2.resources().energy).toBe(before.energy - 2); // nothing came back
  });

  test("Case A → combat: with the shield already spent on the prevented 1, Volibear's 9 combat damage kills the Sergeant; Volibear takes 4, survives healed and conquers bf1 (+1)", async () => {
    const game = await board().build();
    await attackReactAndReachSplit(game, "cs");
    await game.p1.distribute({ sarge: 1, skulker: 4 });
    await finishCombat(game);
    expect(combatDamage(game, "sarge")).toBe(9);
    expect(combatDamage(game, "voli")).toBe(4);
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.zoneOf("voli")).toBe("battlefield-bf1");
    expect(game.state("voli").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  // ---- Case B: Unyielding Spirit -----------------------------------------------------------------------------

  test("Case B: Unyielding Spirit resolves first and arms a turn-long 'prevent all spell/ability damage'; P1 STILL gets the split Decision — total 5, both targets — nothing is stripped (355.14.h does not apply: 2 targets ≤ 5)", async () => {
    const game = await board().build();
    const d = await attackReactAndReachSplit(game, "us");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { body: 0, calm: 1 } }); // 1 + [body]
    const armed = (game.gameState.activeReplacements ?? []) as { replacement?: string; sourceCardId?: string; duration?: string }[];
    expect(armed).toEqual([expect.objectContaining({ duration: "turn", replacement: "prevent", sourceCardId: "us" })]);
    expect(d.total).toBe(5);
    expect(d.buckets.map((b) => b.key).sort()).toEqual(["sarge", "skulker"]);
    expect(d.buckets.map((b) => [b.min, b.max])).toEqual([
      [1, 4],
      [1, 4],
    ]); // the pool was not reduced to 0: each target ≥ 1, so up to 5 − 1 on either (355.14.f)
  });

  test("Case B: P1 resolves a normal ≥1/≥1 split (2 → Sergeant, 3 → Skulker); every packet is prevented to 0 — neither unit is damaged, nothing dies, no ability damage is logged (437.2.a, 417.1.e.1)", async () => {
    const game = await board().build();
    await attackReactAndReachSplit(game, "us");
    expect((await game.p1.try((p) => p.distribute({ sarge: 3, skulker: 3 }))).ok).toBe(false); // still exactly 5 to divide
    await game.p1.distribute({ sarge: 2, skulker: 3 });
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.state("sarge").damage).toBe(0);
    expect(game.state("skulker").damage).toBe(0); // 3 would have been lethal — it was never dealt
    expect([...abilityDamage(game, "sarge"), ...abilityDamage(game, "skulker")].filter((r) => r.amount > 0)).toEqual([]);
  });

  test("Case B: no refund, no retarget, no second prompt — the trigger left the chain, Unyielding Spirit is in the trash, and the showdown simply continues", async () => {
    const game = await board().build();
    await attackReactAndReachSplit(game, "us");
    await game.p1.distribute({ sarge: 2, skulker: 3 });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("us")).toBe("trash");
    const d = game.decision();
    expect(d).toMatchObject({ context: "showdown", kind: "action" });
    expect(d?.kind).not.toBe("distribute");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { body: 0, calm: 1 } });
    expect(game.state("voli")).toMatchObject({ combatRole: "attacker", zone: "battlefield-bf1" });
  });

  test("Case B → combat: Unyielding Spirit does not touch unit-sourced COMBAT damage (417.6.c) — Volibear's 9 kills both defenders (4 + 3 lethal), the defenders' 7 lands on Volibear who survives healed; P1 conquers bf1 (+1)", async () => {
    const game = await board().build();
    await attackReactAndReachSplit(game, "us");
    await game.p1.distribute({ sarge: 2, skulker: 3 });
    await finishCombat(game);
    expect(combatDamage(game, "sarge")).toBeGreaterThanOrEqual(4);
    expect(combatDamage(game, "skulker")).toBeGreaterThanOrEqual(3);
    expect(combatDamage(game, "sarge") + combatDamage(game, "skulker")).toBe(9);
    expect(combatDamage(game, "voli")).toBe(7);
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.zoneOf("voli")).toBe("battlefield-bf1");
    expect(game.state("voli").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
