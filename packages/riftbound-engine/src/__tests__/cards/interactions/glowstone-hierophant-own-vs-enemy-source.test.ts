/**
 * Interaction: Glowstone (ven-133-166) · Gear · Order · 2
 *     "[Empower] [rainbow][rainbow]. Disempower this, [Exhaust]: Choose a player. They gain control
 *      of this and recall it. At the end of your turn, kill this and deal 5 to all units you control."
 *   × Esteemed Hierophant (ven-025-166) · Unit · Calm · 5 · 5 Might
 *     "While you control 7 or more runes, prevent all damage that ENEMY spells and abilities would
 *      deal to me."
 *   × Unyielding Spirit (ogn-145-298) · Spell · Body · 1+[body] · [Reaction]
 *     "Prevent all spell and ability damage this turn."
 *   (+ Vanguard Sergeant ogn-219-298, vanilla 4 Might; Hextech Ray ogn-009-298 "Deal 3 to a unit
 *    at a battlefield" as the enemy-spell sanity probe.)
 *
 * Question: P2 OWNS Glowstone, Empowered it and handed it to P1 with the give-away ability. P1
 * controls Hierophant (7+ runes) and Vanguard Sergeant. At the end of P1's turn Glowstone's
 * trigger deals 5 to all units P1 controls. (a) Is that "enemy" ability damage for Hierophant
 * (owner P2) or friendly (controller P1)? Who dies, whose trash does Glowstone go to? (b) Same
 * turn but P1 resolved Unyielding Spirit first. (c) Sanity: an enemy Hextech Ray at Hierophant.
 *
 * Rules: 417.6.a / 417.6.b.2.a (the ability — and the gear — is the damage source), 417.6.b.4
 * (the CONTROLLER of the source is responsible for the Deal), 108.2-style "you" = controller,
 * 437.1.b / 437.1.b.1.b / 437.4 (prevent "all" → damage not dealt at all), 372, 428 (kill →
 * OWNER's trash).
 *
 * Expected: (a) P1 controls Glowstone when the trigger resolves → it is P1's own ability damage,
 * Hierophant's enemy-only prevention does not apply: Hierophant (5) and Sergeant (4) both take 5
 * and die; Glowstone is killed into its owner P2's trash. (b) Unyielding Spirit prevents ALL
 * spell/ability damage regardless of source → both survive; Glowstone still kills itself. (c)
 * Enemy Hextech Ray with 7+ runes → 0 damage; below 7 runes → 3 damage.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GLOWSTONE = "ven-133-166";
const HIEROPHANT = "ven-025-166";
const VANGUARD_SERGEANT = "ogn-219-298";
const UNYIELDING_SPIRIT = "ogn-145-298";
const HEXTECH_RAY = "ogn-009-298";

/**
 * The position AFTER the hand-off, on P1's turn: Glowstone (owner P2, controller P1, exhausted
 * from its [Exhaust] cost) sits in P1's base; P1 controls 7 calm runes, Hierophant at bf1 and
 * Vanguard Sergeant in base, and holds Unyielding Spirit with exactly 1+[body] to cast it.
 */
function handedOff(opts: { runes?: number } = {}) {
  return scenario()
    .resources(P1, { energy: 1, power: { body: 1 } })
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .runes(P1, "calm", opts.runes ?? 7)
    .unit(P1, "bf1", HIEROPHANT, "hier")
    .unit(P1, "base", VANGUARD_SERGEANT, "serg")
    .unit(P2, "base", { might: 2, name: "P2 Bystander" }, "bystander")
    .card("gs", { controller: P1, def: GLOWSTONE, meta: { exhausted: true }, owner: P2, zone: "base" })
    .hand(P1, UNYIELDING_SPIRIT, "spirit")
    .hand(P2, HEXTECH_RAY, "ray");
}

/** The full story from P2's turn: P2 owns an Empowered Glowstone and is about to give it away. */
function beforeHandOff() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .runes(P1, "calm", 7)
    .unit(P1, "bf1", HIEROPHANT, "hier")
    .unit(P1, "base", VANGUARD_SERGEANT, "serg")
    .unit(P2, "base", { might: 2, name: "P2 Bystander" }, "bystander")
    .gear(P2, GLOWSTONE, "gs", { empowered: true });
}

describe("Glowstone handed to P1 × Esteemed Hierophant — 'enemy' follows CONTROL of the damage source", () => {
  // ---- the hand-off itself -----------------------------------------------------------------

  test("hand-off: P2 pays Disempower+[Exhaust], chooses P1 → Glowstone is in P1's base, controller P1, owner still P2; nothing blows up at the end of P2's turn", async () => {
    const game = await beforeHandOff().build();
    await game.p2.activate("gs", 1);
    expect(game.state("gs")).toMatchObject({ isEmpowered: false, isExhausted: true });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.answer(P1);
    await game.settle();
    expect(game.state("gs")).toMatchObject({ controller: P1, owner: P2, zone: "base" });
    expect(game.p1.base()).toContain("gs");
    expect(game.p2.base()).not.toContain("gs");
    await game.advanceTurn(); // P2's turn ends — P2 no longer controls Glowstone → no trigger
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("gs")).toBe("base");
    expect(game.zoneOf("bystander")).toBe("base");
    expect(game.zoneOf("hier")).toBe("battlefield-bf1");
    expect(game.zoneOf("serg")).toBe("base");
  });

  test("full path: after the hand-off, ending P1's turn puts Glowstone's trigger on the chain under P1's control and it kills Hierophant, Sergeant and itself (→ P2's trash); P2's units untouched", async () => {
    const game = await beforeHandOff().build();
    await game.p2.activate("gs", 1);
    await game.settle();
    await game.p2.answer(P1);
    await game.settle();
    await game.advanceTurn(); // → P1's turn (P1 now controls 9 runes)
    expect(game.p1.runes().length).toBeGreaterThanOrEqual(7);
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gs", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.zoneOf("hier")).toBe("trash");
    expect(game.zoneOf("serg")).toBe("trash");
    expect(game.zoneOf("gs")).toBe("trash");
    expect(game.p2.trash()).toContain("gs"); // owner's trash
    expect(game.p1.trash()).not.toContain("gs");
    expect(game.zoneOf("bystander")).toBe("base"); // "units YOU control" = P1's, not the owner's
  });

  // ---- (a) own-source ability damage is not "enemy" ----------------------------------------

  test("(a) the end-of-turn trigger is P1's chain item (controller of the source, 417.6.b.4), even though P2 owns the gear", async () => {
    const game = await handedOff().build();
    expect(game.state("gs")).toMatchObject({ controller: P1, owner: P2 });
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "gs", controller: P1, triggered: true });
  });

  test("(a) Hierophant with 7 runes is NOT protected from its own controller's ability: takes 5 (= 5 Might) and dies into P1's trash", async () => {
    const game = await handedOff().build();
    expect(game.p1.runes()).toHaveLength(7);
    expect(game.state("hier").might).toBe(5);
    await game.p1.endTurn();
    await game.settle();
    expect(game.zoneOf("hier")).toBe("trash");
    expect(game.p1.trash()).toContain("hier");
  });

  test("(a) Vanguard Sergeant (4 Might) also takes 5 and dies; Glowstone is killed into its OWNER P2's trash; the enemy bystander is untouched", async () => {
    const game = await handedOff().build();
    await game.p1.endTurn();
    await game.settle();
    expect(game.zoneOf("serg")).toBe("trash");
    expect(game.zoneOf("gs")).toBe("trash");
    expect(game.p2.trash()).toContain("gs");
    expect(game.p1.trash()).not.toContain("gs");
    expect(game.state("bystander")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("(a) contrast — if P2 had KEPT Glowstone, its blast at the end of P2's turn hits only P2's units: Hierophant and Sergeant are not 'units you control' and stay put", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .runes(P1, "calm", 7)
      .unit(P1, "bf1", HIEROPHANT, "hier")
      .unit(P1, "base", VANGUARD_SERGEANT, "serg")
      .unit(P2, "base", { might: 2, name: "P2 Bystander" }, "bystander")
      .gear(P2, GLOWSTONE, "gs")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("gs")).toBe("trash");
    expect(game.p2.trash()).toContain("gs");
    expect(game.zoneOf("bystander")).toBe("trash");
    expect(game.zoneOf("hier")).toBe("battlefield-bf1");
    expect(game.zoneOf("serg")).toBe("base");
  });

  // ---- (b) Unyielding Spirit: source-agnostic prevention -----------------------------------

  test("(b) Unyielding Spirit resolved earlier that turn prevents ALL ability damage whatever its controller: Hierophant and Sergeant both survive the blast (437.4)", async () => {
    const game = await handedOff().build();
    await game.p1.cast("spirit");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("spirit")).toBe("trash");
    await game.p1.endTurn();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gs", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("hier")).toBe("battlefield-bf1");
    expect(game.state("hier").damage).toBe(0);
    expect(game.zoneOf("serg")).toBe("base");
    expect(game.state("serg").damage).toBe(0);
    expect(game.p1.trash()).toEqual(["spirit"]);
  });

  test("(b) …but the 'kill this' half is not damage: Glowstone still dies into P2's trash under Unyielding Spirit", async () => {
    const game = await handedOff().build();
    await game.p1.cast("spirit");
    await game.settle();
    await game.p1.endTurn();
    await game.settle();
    expect(game.zoneOf("gs")).toBe("trash");
    expect(game.p2.trash()).toContain("gs");
    expect(game.p1.gear()).not.toContain("gs");
  });

  // ---- (c) sanity: a genuinely ENEMY spell -------------------------------------------------

  test("(c) an ENEMY Hextech Ray at Hierophant while P1 controls 7 runes deals 0 — fully prevented, nothing marked (437.4); the Ray still resolves to P2's trash", async () => {
    const game = await handedOff().active(P2).build();
    expect(game.p1.runes()).toHaveLength(7);
    await game.p2.cast("ray", { targets: "hier" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("hier")).toBe("battlefield-bf1");
    expect(game.state("hier").damage).toBe(0);
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.p2.trash()).toContain("ray");
  });

  test("(c) below 7 runes the static is off: the same enemy Hextech Ray marks 3 damage on Hierophant (survives at 5 Might)", async () => {
    const game = await handedOff({ runes: 6 }).active(P2).build();
    expect(game.p1.runes()).toHaveLength(6);
    await game.p2.cast("ray", { targets: "hier" });
    await game.settle();
    expect(game.zoneOf("hier")).toBe("battlefield-bf1");
    expect(game.state("hier").damage).toBe(3);
  });

  test("(c) rune count is irrelevant to OWN-source damage: with only 6 runes the handed-off Glowstone kills Hierophant just the same", async () => {
    const game = await handedOff({ runes: 6 }).build();
    await game.p1.endTurn();
    await game.settle();
    expect(game.zoneOf("hier")).toBe("trash");
    expect(game.zoneOf("serg")).toBe("trash");
  });
});
