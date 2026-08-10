/**
 * Interaction: Volibear, Furious (ogn-041-298) · Champion Unit · Fury · 10 · 9 Might
 *     "[Deflect 2] … When I attack, deal 5 damage split among any number of enemy units here."
 *   × Pouty Poro (ogn-013-298) · Unit · Fury · 2 · 2 Might
 *     "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)"
 *   × Flash (ogs-011-024) · Spell · Chaos · 2 · "[Reaction] Move up to 2 friendly units to base."
 *   (+ Shipyard Skulker ogn-175-298, vanilla 3 Might.)
 *
 * Question: P1's Volibear attacks bf1 defended by P2's Pouty Poro A, Pouty Poro B and a Skulker.
 *   (a) If P1 names both Poros + Skulker as split targets, how much extra Power is owed and when — per Deflect
 *       target or once? With only 1 spare Power, which target sets are even offered?
 *   (b) P1 (2 spare Power) targets Poro-A + Skulker, paying 1. P2 reacts with Flash moving Poro-A to base. At
 *       resolution: does Poro-A take anything, is the 1 Power refunded, and how is the 5 divided?
 *   (c) Contrast: P2 Flashes BOTH targets to base.
 *
 * Rules: 355.14.a / 355.14.d (each unit of a split is individually a Target, chosen when the ability is
 * finalized, and individually triggers targeting consequences), 809.1.c / 809.1.d + 356.2.a.2 (Deflect: a
 * mandatory additional cost per Deflect unit chosen, paid at finalization; unpayable → not a legal choice),
 * 355.14.e (the division is decided only at resolution), 355.14.f / 355.14.h (fewer targets than damage is
 * fine), 355.14.i (costs paid for a target that later drops out stay paid), 359.3.e.2 / 359.3.e.5 (a target no
 * longer "here" is illegal and unaffected), 359.3.e.7 (all targets illegal → the instruction does not execute).
 *
 * Expected: (a) +1 Power per Poro chosen, paid at finalization: both Poros + Skulker = +2. With 1 spare, no set
 * containing both Poros is legal; {Poro-A, Skulker} etc. are. (b) Flash resolves first; Poro-A is no longer
 * here → unaffected; the 1 Power stays paid; the whole 5 goes to Skulker (the only remaining target) → dies.
 * (c) Both targets gone → no damage is dealt at all, Power still spent; combat then proceeds against Poro-B.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOLIBEAR = "ogn-041-298";
const POUTY_PORO = "ogn-013-298";
const SKULKER = "ogn-175-298";
const FLASH = "ogs-011-024";

/**
 * P1's turn. P2 holds bf1 with Poro-A, Poro-B (Deflect, 2) and a Skulker (3), Flash in hand with exactly its
 * [2]. P1's Volibear is ready in base with `spare` off-domain (fury) power and nothing else.
 */
function board(spare: number) {
  return scenario()
    .resources(P1, { power: { fury: spare } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", POUTY_PORO, "poroA")
    .unit(P2, "bf1", POUTY_PORO, "poroB")
    .unit(P2, "bf1", SKULKER, "skulker")
    .unit(P1, "base", VOLIBEAR, "voli")
    .hand(P2, FLASH, "flash");
}

/** Volibear attacks; if the engine asks for the split targets at finalization, name `targets`; P1 then passes priority to P2. */
async function attackNaming(spare: number, targets: readonly string[]): Promise<Game> {
  const game = await board(spare).build();
  await game.p1.move("voli", "bf1");
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick(...targets);
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

/** …P2 answers with Flash on `flashed`; both pass so that exactly Flash resolves (Volibear's trigger still waiting). */
async function flashInResponse(game: Game, flashed: readonly string[]): Promise<void> {
  await game.p2.cast("flash", { targets: [...flashed] });
  expect(game.chain().map((i) => i.cardId)).toEqual(["voli", "flash"]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("flash")).toBe("trash");
  expect(game.chain().map((i) => i.cardId)).toEqual(["voli"]);
}

/** …then both pass again so Volibear's trigger resolves (possibly into a split prompt). */
async function resolveTrigger(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
}

describe("Volibear's split trigger × two Deflect Poros × Flash — per-target Deflect, paid once and kept", () => {
  test("the attack trigger pends the moment Volibear becomes the Attacker; the three defenders are Poro-A, Poro-B (Deflect) and the Skulker; P1 starts with priority", async () => {
    const game = await board(2).build();
    expect(game.state("poroA").keywords).toContain("Deflect");
    expect(game.state("voli").keywords).toContain("Deflect");
    await game.p1.move("voli", "bf1");
    expect(game.state("voli").combatRole).toBe("attacker");
    for (const d of ["poroA", "poroB", "skulker"]) {
      expect(game.state(d).combatRole).toBe("defender");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", controller: P1, triggered: true, type: "ability" })]);
    expect(game.actingSeat()).toBe(P1);
  });

  // ---- (a) targets & Deflect at finalization ----------------------------------------------------------------

  // Expected (355.14.a/d): the units of the split are TARGETS, chosen when the trigger is finalized — P1 faces
  // a finalization-time choice over the enemy units here before anyone gets priority. Actual: the trigger is
  // put on the chain target-less and the recipients are only picked inside the resolution-time "Split 5
  // damage" prompt, so nothing about the targets is known (or paid for) while players could still respond.
  test("(a) the split targets are chosen at FINALIZATION — right after the move P1 is asked (FIN) to name any number of Poro-A / Poro-B / Skulker (355.14.a, 355.14.d)", async () => {
    const game = await board(2).build();
    await game.p1.move("voli", "bf1");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["poroA", "poroB", "skulker"]);
  });

  // Expected (809.1.c/d, 356.2.a.2): Deflect is owed once PER Deflect unit chosen — both Poros + Skulker costs
  // 2 extra Power of any domain, paid as the trigger is finalized. Actual: no target choice exists and no
  // Deflect is ever charged for Volibear's split (P1 keeps both fury).
  test("(a) naming both Poros + the Skulker costs +2 Power (one per Deflect target), paid at finalization: fury 2 → 0, and the chain item lists all three targets", async () => {
    const game = await board(2).build();
    await game.p1.move("voli", "bf1");
    await game.p1.pick("poroA", "poroB", "skulker");
    expect(game.p1.power("fury")).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", targets: expect.arrayContaining(["poroA", "poroB", "skulker"]) })]);
    expect(game.chain()[0]?.targets).toHaveLength(3);
  });

  // Expected: with 1 spare Power any set containing BOTH Poros is unpayable and therefore not a legal choice;
  // {Poro-A, Skulker} is, and costs the 1. Actual: no finalization choice; at resolution every enemy unit here
  // is offered regardless of Power and nothing is charged.
  test("(a) with only 1 spare Power {Poro-A, Poro-B} is rejected, {Poro-A, Skulker} is accepted and costs exactly that 1 (356.2.a.2, 809.1.d)", async () => {
    const game = await board(1).build();
    await game.p1.move("voli", "bf1");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect((await game.p1.try((p) => p.pick("poroA", "poroB"))).ok).toBe(false);
    expect(game.p1.power("fury")).toBe(1);
    await game.p1.pick("poroA", "skulker");
    expect(game.p1.power("fury")).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", targets: expect.arrayContaining(["poroA", "skulker"]) })]);
  });

  // Expected: with ZERO spare Power neither Poro can be chosen at all — only the Skulker can ever be hurt by
  // the trigger. Actual: the resolution-time split offers both Poros and lets P1 kill them for free.
  test("(a) with 0 spare Power the Poros can never be recipients of the split — only the Skulker is (809.1.d)", async () => {
    const game = await board(0).build();
    await game.p1.move("voli", "bf1");
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card)).toEqual(["skulker"]);
      return;
    }
    await game.settle();
    const split = game.decision();
    expect(split).toMatchObject({ kind: "distribute", seat: P1 });
    expect(split?.kind === "distribute" ? split.buckets.map((b) => b.card) : []).toEqual(["skulker"]);
  });

  // ---- (b) Flash on Poro-A after P1 paid for {Poro-A, Skulker} ---------------------------------------------------

  // Expected: P1 names Poro-A + Skulker and pays exactly 1 (fury 2 → 1); the item's targets are locked before P2
  // may respond. Actual: no finalization choice / no payment (fury stays 2, item has no targets).
  test("(b) P1 targets Poro-A + Skulker paying 1 Deflect Power at finalization (fury 2 → 1); the chain item shows exactly those two targets when P2 gets priority", async () => {
    const game = await attackNaming(2, ["poroA", "skulker"]);
    expect(game.p1.power("fury")).toBe(1);
    expect([...(game.chain()[0]?.targets ?? [])].sort()).toEqual(["poroA", "skulker"]);
  });

  test("(b) with priority P2 may answer with Flash ([Reaction]) on Poro-A; Flash resolves FIRST (LIFO): Poro-A is in P2's base, no longer a defender, while Volibear's trigger is still waiting on the chain", async () => {
    const game = await attackNaming(2, ["poroA", "skulker"]);
    expect(game.p2.can("cast", "flash")).toBe(true);
    await flashInResponse(game, ["poroA"]);
    expect(game.state("poroA")).toMatchObject({ combatRole: null, damage: 0, location: "base" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p2.units("bf1").sort()).toEqual(["poroB", "skulker"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(b) at resolution Poro-A — no longer 'here' — is not a legal recipient and takes nothing (359.3.e.2/.5); the division is only made now (355.14.e), so the WHOLE 5 may go to the Skulker (355.14.f) → Skulker dies", async () => {
    const game = await attackNaming(2, ["poroA", "skulker"]);
    await flashInResponse(game, ["poroA"]);
    await resolveTrigger(game);
    const d = game.decision();
    if (d?.kind === "distribute") {
      expect(d).toMatchObject({ seat: P1, total: 5 });
      expect(d.buckets.map((b) => b.card)).not.toContain("poroA");
      expect(d.buckets.find((b) => b.card === "skulker")?.max).toBe(5);
      await game.p1.distribute({ skulker: 5 });
    }
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.state("poroA")).toMatchObject({ damage: 0, location: "base" });
    expect(game.state("poroB")).toMatchObject({ damage: 0, location: "bf1" });
    // Back in the showdown, Focus with the attacker.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  // Expected (355.14.i): the Deflect Power paid for Poro-A stays paid although Poro-A dropped out — P1 ends the
  // sequence on fury 1 (2 − 1, no refund, nothing extra); and Poro-B, never a target, is not a possible recipient
  // at resolution. Actual: nothing was ever paid (fury 2) and the resolution prompt offers Poro-B too.
  test("(b) no refund and no re-targeting: after Flash + resolution P1's fury is exactly 1 (355.14.i) and Poro-B was never offered as a recipient", async () => {
    const game = await attackNaming(2, ["poroA", "skulker"]);
    await flashInResponse(game, ["poroA"]);
    await resolveTrigger(game);
    const d = game.decision();
    if (d?.kind === "distribute") {
      expect(d.buckets.map((b) => b.card)).toEqual(["skulker"]);
      await game.p1.distribute({ skulker: 5 });
    }
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.p1.power("fury")).toBe(1);
  });

  test("(b) the combat then finishes: Volibear 9 vs Poro-B 2 → Poro-B dies, Volibear is healed and conquers bf1 (+1); Poro-A sits safely in base", async () => {
    const game = await attackNaming(2, ["poroA", "skulker"]);
    await flashInResponse(game, ["poroA"]);
    await resolveTrigger(game);
    if (game.decision()?.kind === "distribute") {
      await game.p1.distribute({ skulker: 5 });
    }
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("poroB")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.state("voli")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.state("poroA")).toMatchObject({ damage: 0, location: "base" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  // ---- (c) Flash on BOTH targets ------------------------------------------------------------------------------

  test("(c) P2 Flashes BOTH Poro-A and the Skulker ('up to 2'): both are in base with 0 damage before the trigger resolves; only Poro-B still defends", async () => {
    const game = await attackNaming(2, ["poroA", "skulker"]);
    await flashInResponse(game, ["poroA", "skulker"]);
    expect(game.state("poroA")).toMatchObject({ combatRole: null, damage: 0, location: "base" });
    expect(game.state("skulker")).toMatchObject({ combatRole: null, damage: 0, location: "base" });
    expect(game.p2.units("bf1")).toEqual(["poroB"]);
    expect(game.state("poroB").combatRole).toBe("defender");
  });

  // Expected (359.3.e.7/.10): every target of the deal instruction is now illegal, so it does not execute at
  // all — no split prompt, no damage anywhere (Poro-B was never a target), and the 1 Power stays spent.
  // Actual: the resolution-time prompt simply re-aims the 5 at whoever is still here (Poro-B is offered),
  // and nothing was paid in the first place.
  test("(c) with all of its targets gone the deal cannot execute: the trigger resolves with NO prompt, nobody takes damage, Poro-B is untouched, P1's fury stays at 1 (359.3.e.7, 355.14.i)", async () => {
    const game = await attackNaming(2, ["poroA", "skulker"]);
    await flashInResponse(game, ["poroA", "skulker"]);
    await resolveTrigger(game);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // straight back to the showdown
    expect(game.state("poroB")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.state("poroA").damage).toBe(0);
    expect(game.state("skulker").damage).toBe(0);
    expect(game.p1.power("fury")).toBe(1);
  });

  test("(c) either way the trigger never touches the two Flashed units, and the combat is Volibear 9 vs Poro-B 2: Poro-B dies, Volibear healed, P1 conquers bf1 (+1); Poro-A and the Skulker survive in base", async () => {
    const game = await attackNaming(2, ["poroA", "skulker"]);
    await flashInResponse(game, ["poroA", "skulker"]);
    await resolveTrigger(game);
    if (game.decision()?.kind === "distribute") {
      await game.p1.distribute({ poroB: 0 }); // decline to re-aim at a non-target
    }
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.state("poroA")).toMatchObject({ damage: 0, location: "base" });
    expect(game.state("skulker")).toMatchObject({ damage: 0, location: "base" });
    expect(game.zoneOf("poroB")).toBe("trash");
    expect(game.state("voli")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
