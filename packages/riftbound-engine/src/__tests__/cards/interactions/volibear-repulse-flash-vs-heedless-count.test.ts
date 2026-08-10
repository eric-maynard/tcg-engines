/**
 * Interaction: how many friendly units does a finalized SPLIT-damage trigger "choose" — and can that
 * count be lowered by moving targets home (no) or by killing them (yes)? The CR's own example.
 *
 *   × Volibear, Furious     (ogn-041-298, Champion Unit, fury, 9 Might) "[Deflect 2] … When I attack,
 *                            deal 5 damage split among any number of enemy units here."
 *   × Repulse               (unl-106-219, Spell, body, 1 + [body], Reaction) "Choose a friendly unit at
 *                            a battlefield. Counter an enemy spell or ability that chooses it and no
 *                            other friendly unit."
 *   × Heedless Resurrection (unl-142-219, Spell, chaos, 2 + [chaos], Reaction) "As an additional cost
 *                            to play this, kill a friendly unit. Play a unit from your trash that costs
 *                            no more Energy and no more Power than the killed unit, ignoring its cost."
 *   (+ Flash, ogs-011-024, Reaction, 2: "Move up to 2 friendly units to base.")
 *
 * Rules: 355.14.a/.b/.d (every unit chosen for a split IS a target, chosen when the ability is
 * FINALIZED, each counting individually), 355.14.i (costs paid / triggers fired because of those
 * choices are never undone), 359.3.e.4 (a target that changed to a non-board zone is a different
 * object), 359.3.e.9.a (counting what a finalized item targets: mistargeted-but-on-board choices
 * still count, choices that went to a non-board zone do not — Volibear/Flash/Heedless/Repulse is
 * the printed example), 809.1.c (Deflect taxes spells that target the PERMANENT).
 *
 * Question. P1's Volibear attacks bf1; P2 defends with A, B, C and P1 names all three for the split.
 *  (a) Can P2 Repulse the trigger right away choosing A?  (b) P2 Flashes B and C to base first, then
 *  Repulse?  (c) P2 plays Heedless Resurrection twice (killing B and C as the cost), then Repulse — legal?
 *  If it resolves does A take anything, and are the kills undone?  (d) Baseline: Volibear names ONLY A.
 *
 * Expected. (a) No — the trigger chooses A AND B, C. (b) Still no — B, C are mistargeted but still on
 * the board, so they still count. (c) Yes — B, C went to the trash (non-board), the trigger now
 * chooses only A; Repulse counters it, A takes nothing; the Heedless kills/plays stay. Combat then
 * proceeds Volibear vs A. (d) Yes — single target A → legal from the start.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VOLIBEAR = "ogn-041-298";
const REPULSE = "unl-106-219";
const HEEDLESS = "unl-142-219";
const FLASH = "ogs-011-024";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

const TWO_DROP = { cardType: "unit", energyCost: 2, might: 2 } as const;
const BONES = { cardType: "unit", energyCost: 1, might: 1 } as const;

/**
 * P1's turn. P2 holds bf1 with A (3), B (2), C (2) — all 2-cost so Heedless can trade them for the
 * 1-cost Bones in P2's trash. P2's pool covers Repulse (1+[body]) + Flash (2) + 2× Heedless (2+[chaos])
 * with 2 spare power (see the Deflect note at the bottom).
 */
function board(p2Power: Record<string, number> = { body: 1, chaos: 2, rainbow: 2 }) {
  return scenario()
    .resources(P2, { energy: 12, power: p2Power })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", VOLIBEAR, "volibear")
    .unit(P2, "bf1", { ...TWO_DROP, might: 3, name: "Alpha" }, "a")
    .unit(P2, "bf1", { ...TWO_DROP, name: "Bravo" }, "b")
    .unit(P2, "bf1", { ...TWO_DROP, name: "Charlie" }, "c")
    .trash(P2, { ...BONES, name: "Bones One" }, "bones1")
    .trash(P2, { ...BONES, name: "Bones Two" }, "bones2")
    .hand(P2, REPULSE, "repulse")
    .hand(P2, FLASH, "flash")
    .hand(P2, HEEDLESS, "heedless1")
    .hand(P2, HEEDLESS, "heedless2");
}

/**
 * Volibear attacks bf1; P1 names `targets` for the split if (as 355.14.b demands) the engine asks at
 * finalization; then P1 passes priority so P2 may respond. Leaves the trigger on the chain, P2 to act.
 */
async function attackNaming(game: Game, targets: string[]): Promise<void> {
  await game.p1.move("volibear", "bf1");
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick(...targets);
    const cont = game.decision();
    if (cont?.kind === "pick" && cont.seat === P1 && cont.allowDecline) {
      await game.p1.decline(); // "any number": stop here
    }
  }
  expect(game.chain()).toHaveLength(1);
  expect(game.chain()[0]).toMatchObject({ cardId: "volibear", controller: P1, triggered: true });
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
}

/** The seat holding priority passes, then the other one → the top chain item resolves. */
async function resolveTop(game: Game): Promise<void> {
  const first = game.actingSeat();
  await game.acting().passPriority();
  const d = game.decision();
  if (d?.kind === "action" && d.context === "chain" && game.actingSeat() !== first) {
    await game.acting().passPriority();
  }
}

/** P2 plays Heedless Resurrection killing `victim`, resolves it, returns `bones` to P2's BASE. */
async function heedless(game: Game, spell: string, victim: string, bones: string): Promise<void> {
  if (game.actingSeat() === P1) {
    await game.p1.passPriority();
  }
  await game.p2.cast(spell, { sacrifice: victim });
  expect(game.zoneOf(victim)).toBe("trash"); // 356.2 — the kill is a COST, paid on finalize
  await resolveTop(game);
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P2) {
      break;
    }
    const wanted = d.options.find((o) => o.key === bones || o.card === bones) ?? d.options.find((o) => o.key === "base");
    await game.p2.pick((wanted ?? d.options[0]!).key);
  }
  expect(game.zoneOf(bones)).toBe("base");
}

describe("355.14.b — the split targets are real targets, named as the trigger is FINALIZED", () => {
  // Expected: right after the move, before anyone holds priority, P1 is asked which enemy units here
  // the 5 damage will be split among; the finalized chain item then lists exactly those targets, and
  // on resolution only THEY get a bucket. Actual: the trigger is finalized with no targets (P1 gets
  // priority at once, chain item targets = null) and the whole choice is deferred to a resolve-time
  // "Split 5 damage" over every enemy unit here.
  test("P1 must choose the split targets when Volibear's trigger goes on the chain (355.14.b), not at resolution — naming only A binds targets=[a] and later offers only A a bucket", async () => {
    const game = await board().build();
    await game.p1.move("volibear", "bf1");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["a", "b", "c"]);
    await game.p1.pick("a");
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
    }
    expect(game.chain()[0]?.targets).toEqual(["a"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    const r = game.decision();
    const buckets = r?.kind === "distribute" ? r.buckets.map((b) => b.key) : ["(auto: a)"];
    expect(buckets).not.toContain("b");
    expect(buckets).not.toContain("c");
  });

  test("setup facts that hold either way: the attack contests bf1, Volibear's 'When I attack' trigger is the only chain item (P1's), and A/B/C are all defenders here", async () => {
    const game = await board().build();
    await game.p1.move("volibear", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["volibear"]);
    expect(game.state("volibear").combatRole).toBe("attacker");
    for (const u of ["a", "b", "c"]) {
      expect(game.state(u).combatRole).toBe("defender");
    }
  });
});

describe("(a) all three named: Repulse on A is NOT legal — the trigger chooses A 'and other friendly units'", () => {
  // Expected: with A, B, C all targets (355.14.a/.d) no friendly unit satisfies "chooses it and no
  // other friendly unit" → Repulse has no legal second choice → not castable. Actual: the engine never
  // bound the split targets, its exclusivity check has nothing to count, and Repulse is offered.
  test("with A+B+C targeted, P2 (holding priority) cannot play Repulse against Volibear's trigger (355.14.d + Repulse text)", async () => {
    const game = await board().build();
    await attackNaming(game, ["a", "b", "c"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "repulse")).toBe(false);
    const r = await game.p2.try((p) => p.cast("repulse", { targets: "volibear" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("repulse")).toBe("hand");
  });
});

describe("(b) Flash B and C home first: they are mistargeted but still ON THE BOARD, so they still count (359.3.e.9.a) — Repulse stays illegal", () => {
  test("Flash is a legal response naming B and C; it resolves first (LIFO): B and C are in P2's base, A and Volibear remain at bf1, the trigger is still pending", async () => {
    const game = await board().build();
    await attackNaming(game, ["a", "b", "c"]);
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: ["b", "c"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["volibear", "flash"]);
    await resolveTop(game);
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("b")).toBe("base");
    expect(game.locationOf("c")).toBe("base");
    expect(game.locationOf("a")).toBe("bf1");
    expect(game.locationOf("volibear")).toBe("bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["volibear"]);
    expect(game.p2.energy()).toBe(10);
  });

  // Expected: B and C only MOVED (board → board): still counted among the trigger's choices, so the
  // trigger still "chooses" three friendly units and Repulse remains uncastable. Actual: offered.
  test("after Flash resolves and P1 passes again, Repulse is STILL not a legal play for P2 (359.3.e.9.a: mistargeted choices are included in the count)", async () => {
    const game = await board().build();
    await attackNaming(game, ["a", "b", "c"]);
    await game.p2.cast("flash", { targets: ["b", "c"] });
    await resolveTop(game);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "repulse")).toBe(false);
  });

  test("…so the trigger resolves: B and C (in base, no longer 'here') are unaffected; only A can receive the split and takes all 5 → dies before combat damage; Volibear then conquers the emptied bf1", async () => {
    const game = await board().build();
    await attackNaming(game, ["a", "b", "c"]);
    await game.p2.cast("flash", { targets: ["b", "c"] });
    await resolveTop(game); // Flash
    await resolveTop(game); // Volibear's trigger
    const d = game.decision();
    if (d?.kind === "distribute") {
      expect(d.seat).toBe(P1);
      expect(d.total).toBe(5);
      expect(d.buckets.map((b) => b.key)).toEqual(["a"]);
      await game.p1.distribute({ a: 5 });
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.state("b")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("c")).toMatchObject({ damage: 0, zone: "base" });
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.state("volibear")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  });
});

describe("(c) Heedless Resurrection ×2 killing B and C: they changed to a NON-board zone, so the trigger now chooses only A — Repulse becomes legal and counters it", () => {
  test("each Heedless kills its unit as a COST on finalize (B, then C, straight to the trash) and on resolution plays a 1-cost Bones from P2's trash — into P2's base", async () => {
    const game = await board().build();
    await attackNaming(game, ["a", "b", "c"]);
    const sac = game.p2.option("cast", "heedless1")?.fields.find((f) => f.arg === "sacrifice")?.options ?? [];
    expect([...sac].sort()).toEqual(["a", "b", "c"]);
    await heedless(game, "heedless1", "b", "bones1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["volibear"]);
    await heedless(game, "heedless2", "c", "bones2");
    expect(game.p2.trash()).toEqual(expect.arrayContaining(["b", "c", "heedless1", "heedless2"]));
    expect(game.p2.base()).toEqual(expect.arrayContaining(["bones1", "bones2"]));
    expect(game.p2.units("bf1")).toEqual(["a"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["volibear"]); // trigger still pending
    expect(game.p2.resources().energy).toBe(8);
  });

  test("with B and C in the trash, Repulse IS legal for P2: it goes on the chain above Volibear's trigger, aimed at that trigger", async () => {
    const game = await board().build();
    await attackNaming(game, ["a", "b", "c"]);
    await heedless(game, "heedless1", "b", "bones1");
    await heedless(game, "heedless2", "c", "bones2");
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "repulse")).toBe(true);
    const items = (game.p2.option("cast", "repulse")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(items).toContain("volibear");
    await game.p2.cast("repulse", { targets: "volibear" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["volibear", "repulse"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "repulse", controller: P2, targets: ["volibear"], triggered: false });
  });

  test("Repulse resolves → Volibear's trigger is countered and leaves the chain: A takes NOTHING and is still defending at bf1; the showdown continues with P1's Focus", async () => {
    const game = await board().build();
    await attackNaming(game, ["a", "b", "c"]);
    await heedless(game, "heedless1", "b", "bones1");
    await heedless(game, "heedless2", "c", "bones2");
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("repulse", { targets: "volibear" });
    await resolveTop(game);
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).not.toBe("distribute"); // no split ever happens
    expect(game.zoneOf("repulse")).toBe("trash");
    expect(game.state("a")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("a").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("355.14.i — nothing already paid is reversed by the counter: B and C stay dead, both Bones stay in play (in base, not at bf1), P2's energy/power stay spent", async () => {
    const game = await board().build();
    await attackNaming(game, ["a", "b", "c"]);
    await heedless(game, "heedless1", "b", "bones1");
    await heedless(game, "heedless2", "c", "bones2");
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("repulse", { targets: "volibear" });
    const afterPaying = game.p2.resources();
    await resolveTop(game);
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("c")).toBe("trash");
    expect(game.state("bones1")).toMatchObject({ controller: P2, zone: "base" });
    expect(game.state("bones2")).toMatchObject({ controller: P2, zone: "base" });
    expect(game.p2.units("bf1")).toEqual(["a"]);
    expect(game.p2.resources()).toEqual(afterPaying);
    expect(afterPaying.energy).toBe(7); // 12 − 2 − 2 − 1
  });

  test("combat then proceeds Volibear (9) vs A (3) alone: A dies to combat damage, Volibear takes 3 and survives (healed), P1 conquers bf1 for 1 point; the Bones in base never fought", async () => {
    const game = await board().build();
    await attackNaming(game, ["a", "b", "c"]);
    await heedless(game, "heedless1", "b", "bones1");
    await heedless(game, "heedless2", "c", "bones2");
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("repulse", { targets: "volibear" });
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.state("volibear")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.state("bones1")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("bones2")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) baseline — Volibear names ONLY A: Repulse is legal from the start (single target, no other friendly unit)", () => {
  test("P2 may Repulse immediately; it counters the trigger and A takes nothing — B and C untouched, all three still defend", async () => {
    const game = await board().build();
    await attackNaming(game, ["a"]);
    expect(game.p2.can("cast", "repulse")).toBe(true);
    await game.p2.cast("repulse", { targets: "volibear" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["volibear", "repulse"]);
    await resolveTop(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("repulse")).toBe("trash");
    for (const u of ["a", "b", "c"]) {
      expect(game.state(u)).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("control without Repulse: the trigger resolves and A alone eats the full 5 (≥ 3 Might) → A is dead BEFORE combat damage while B and C are unharmed — exactly what Repulse prevented above", async () => {
    const game = await board().build();
    await attackNaming(game, ["a"]);
    await game.p2.passPriority();
    const d = game.decision();
    if (d?.kind === "distribute") {
      await game.p1.distribute({ a: 5 });
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.state("b")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("c")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    // and the combat afterwards: 9 into B (2) + C (2) kills both; Volibear takes 4, survives; P1 conquers.
    await game.settle();
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("c")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  // Expected (809.1.c): Deflect taxes spells/abilities that target the PERMANENT ("me"). Repulse's
  // choices are a friendly unit and Volibear's ABILITY on the chain — it never chooses Volibear — so it
  // costs exactly 1 + [body]. Actual: the engine keys the ability's chain item by Volibear's card id and
  // charges [Deflect 2] on top, so with exactly 1 energy + 1 body Repulse is not offered.
  test.failing("BUG: Repulse aimed at Volibear's trigger pays no Deflect — castable with exactly 1 energy + [body] (809.1.c: Deflect is about choosing the unit, not its ability)", async () => {
    const game = await board().resources(P2, { energy: 1, power: { body: 1 } }).build();
    await attackNaming(game, ["a"]);
    expect(game.p2.resources()).toEqual({ energy: 1, power: { body: 1 } });
    expect(game.p2.can("cast", "repulse")).toBe(true);
    await game.p2.cast("repulse", { targets: "volibear" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });
});
