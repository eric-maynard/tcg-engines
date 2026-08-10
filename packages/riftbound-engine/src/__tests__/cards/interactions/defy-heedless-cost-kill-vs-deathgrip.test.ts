/**
 * Interaction: Defy (ogn-045-298) · Spell · Calm · 1 + [calm] · Reaction
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Heedless Resurrection (unl-142-219) · Spell · Chaos · 2 + [chaos] · Reaction
 *     "As an additional cost to play this, kill a friendly unit. Play a unit from your trash that costs no
 *      more Energy and no more Power than the killed unit, ignoring its cost."
 *   × Deathgrip (sfd-163-221) · Spell · Order · 2 · Reaction
 *     "Kill a friendly unit. If you do, give +[Might] equal to its Might to another friendly unit this turn.
 *      Draw 1."
 *
 * Rules: 356.2.a / 357.2 (a mandatory ADDITIONAL COST is paid in the Pay Costs step of the play — before the
 * spell is finalized and before anyone else holds priority), 355.5 (targets are chosen at play time but
 * nothing happens to them until resolution), 340.1 (LIFO — Defy resolves first), 425.1.a / 425.1.a.1 (a
 * countered spell does nothing and goes to the trash), 425.1.c / 425.1.c.1 (countering refunds NO cost,
 * "including additional costs"), 359.3.d, 206.
 *
 * Question: P1's turn, Open state. P1: K (4-cost, 4 Might) and F (2) in base, T (3-cost unit) in the trash.
 * P2 holds Defy with 1 + [calm].
 *   Line A — P1 plays Heedless Resurrection killing K as the additional cost (T is the unit to bring back);
 *            P2 Defies it.
 *   Line B — P1 plays Deathgrip on K (F to be pumped); P2 Defies it.
 * For each: is Defy legal, and after the chain empties where are K, T, F, the spell; any refund? Controls:
 * each spell unanswered.
 *
 * Expected: both are legal Defy targets (2 ≤ 4 energy; ≤ 1 power). A: K is ALREADY in the trash when P2
 * first holds priority (cost); Defy counters → Heedless to trash doing nothing, T stays in the trash, K
 * stays in the trash, 2 + [chaos] stay spent. B: the kill is an instruction → countered → K alive on the
 * board, F unchanged (2), no draw, Deathgrip to trash, 2 energy not refunded. Controls: A → K dead, T enters
 * base exhausted for free; B → K dies at resolution, F +4 this turn, P1 draws 1.
 * Zone table after the counter — A: K trash, T trash, Heedless trash, Defy P2's trash. B: K board, F board
 * (2 Might), Deathgrip trash, Defy P2's trash.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const HEEDLESS = "unl-142-219";
const DEATHGRIP = "sfd-163-221";

const K_DEF = { cardType: "unit", energyCost: 4, might: 4, name: "Unit K" } as const;
const F_DEF = { cardType: "unit", energyCost: 2, might: 2, name: "Unit F" } as const;
const T_DEF = { cardType: "unit", energyCost: 3, might: 3, name: "Unit T" } as const;

/**
 * P1's turn 2, Neutral Open. P1: K (4/4) + F (2/2) in base, T (3-cost) in trash, Heedless + Deathgrip in
 * hand, energy 4 + [chaos] (either spell once, with 2 left over so "no refund" is visible as 2, not 4).
 * P2: a 3-Might bystander (never a friendly-kill candidate), Defy in hand, exactly 1 + [calm].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .unit(P1, "base", K_DEF, "k")
    .unit(P1, "base", F_DEF, "f")
    .trash(P1, T_DEF, "t")
    .unit(P2, "base", { might: 3, name: "Enemy" }, "enemy")
    .hand(P1, HEEDLESS, "hr")
    .hand(P1, DEATHGRIP, "dg")
    .hand(P2, DEFY, "defy");
}

const defyTargets = (game: Game): string[] =>
  (game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? []).flat() as string[];

/** Line A up to P2's first priority: Heedless played with K as its additional-cost kill, P1 passes. */
async function lineA(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("hr", { sacrifice: "k" });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

/** Line B up to P2's first priority: Deathgrip played naming K, P1 passes. */
async function lineB(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("dg", { targets: "k" });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Defy vs a COST-kill (Heedless Resurrection) and an EFFECT-kill (Deathgrip)", () => {
  // ── Line A: Heedless Resurrection — the kill is an additional cost ─────────────────────────

  test("A: Heedless's additional cost offers only FRIENDLY units able to cover a unit in the trash — K (4 ≥ T's 3); F (2) and the enemy are not sacrifice options (356.2.a, 357.3)", async () => {
    const game = await board().build();
    const sac = game.p1.option("cast", "hr")?.fields.find((f) => f.arg === "sacrifice");
    expect(sac?.required).toBe(true);
    expect(sac?.options ?? []).toEqual(["k"]);
    await expect(game.p1.cast("hr", { sacrifice: "enemy" })).rejects.toThrow();
    expect(game.zoneOf("hr")).toBe("hand");
  });

  test("A: the cost is paid in the Pay Costs step (357.2): the moment Heedless is on the chain — P1 still holding priority, P2 not yet asked — K is ALREADY in P1's trash and 2 + [chaos] are spent; T untouched in the trash", async () => {
    const game = await board().build();
    await game.p1.cast("hr", { sacrifice: "k" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.zoneOf("k")).toBe("trash");
    expect(game.zoneOf("t")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hr", controller: P1, triggered: false })]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0 } });
    await game.p1.passPriority();
    // P2's first look at the game since the play: K is gone.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.units("base")).toEqual(["f"]);
  });

  test("A: Defy is a legal answer — Heedless (2 energy, one [chaos]) is within 'no more than [4] and no more than [rainbow]'; P2 pays 1 + [calm] and Defy sits on top naming Heedless", async () => {
    const game = await lineA();
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(defyTargets(game)).toEqual(["hr"]);
    await game.p2.cast("defy", { targets: "hr" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "hr", controller: P1 }),
      expect.objectContaining({ cardId: "defy", controller: P2, targets: ["hr"] }),
    ]);
  });

  test("A: Defy resolves first (340.1) and counters Heedless: Heedless → P1's trash doing nothing (425.1.a.1) — T is NOT played and stays in the trash, no 'pick a unit to play' is ever asked", async () => {
    const game = await lineA();
    await game.p2.cast("defy", { targets: "hr" });
    const r = await game.settle();
    expect(r.reason).toBe("open"); // never stopped on a play-from-trash pick
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("hr")).toBe("trash");
    expect(game.zoneOf("t")).toBe("trash");
    expect(game.p1.units()).toEqual(["f"]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p2.trash()).toEqual(["defy"]);
  });

  test("A: nothing is refunded, 'including additional costs' (425.1.c.1): K STAYS in the trash and P1's 2 + [chaos] stay spent — zone table A: K trash, T trash, Heedless trash, Defy P2's trash", async () => {
    const game = await lineA();
    await game.p2.cast("defy", { targets: "hr" });
    await game.settle();
    expect(game.zoneOf("k")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["hr", "k", "t"]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0 } });
    expect(game.state("f")).toMatchObject({ might: 2, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("A control — unanswered: K dead (the cost), Heedless resolves and T — the only unit costing ≤ K — is played from the trash into P1's base EXHAUSTED, ignoring its cost (P1 still on 2 energy)", async () => {
    const game = await board().build();
    await game.p1.cast("hr", { sacrifice: "k" });
    const r = await game.settle();
    if (r.reason === "unanswered") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      expect(game.decision()?.kind === "pick" ? game.decision()!.options.map((o) => ("card" in o ? o.card : undefined) ?? o.key) : []).toEqual(["t"]);
      await game.p1.pick("t");
      await game.settle();
    }
    expect(game.zoneOf("k")).toBe("trash");
    expect(game.zoneOf("t")).toBe("base");
    expect(game.state("t")).toMatchObject({ controller: P1, isExhausted: true, might: 3 });
    expect(game.zoneOf("hr")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0 } }); // T's 3 never charged
    expect(game.violations()).toEqual([]);
  });

  // ── Line B: Deathgrip — the kill is an instruction ─────────────────────────────────────────

  test("B: Deathgrip names K as its target at play time (355.5) but K is still ALIVE on the board while the spell waits; only the 2 energy is gone ([chaos] untouched)", async () => {
    const game = await board().build();
    expect((game.p1.option("cast", "dg")?.fields.find((f) => f.name === "targets")?.options ?? []).flat().sort()).toEqual(["f", "k"]);
    await game.p1.cast("dg", { targets: "k" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dg", controller: P1, targets: ["k"], triggered: false })]);
    expect(game.zoneOf("k")).toBe("base");
    expect(game.state("k")).toMatchObject({ damage: 0, might: 4 });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 1 } });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.zoneOf("k")).toBe("base"); // still there when P2 decides
  });

  test("B: Defy is a legal answer — Deathgrip (2 energy, no power) qualifies; Defy goes on top naming Deathgrip", async () => {
    const game = await lineB();
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(defyTargets(game)).toEqual(["dg"]);
    await game.p2.cast("defy", { targets: "dg" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dg", "defy"]);
    expect(game.chain()[1]).toMatchObject({ controller: P2, targets: ["dg"] });
  });

  test("B: Defy counters Deathgrip → NONE of its instructions execute: K stays on the board alive and undamaged, F gets no Might (still 2), P1 draws nothing; Deathgrip → P1's trash", async () => {
    const game = await lineB();
    const hand0 = game.p1.hand().length; // Heedless + filler
    await game.p2.cast("defy", { targets: "dg" });
    const r = await game.settle();
    expect(r.reason).toBe("open"); // no "+Might to which unit?" prompt either
    expect(game.zoneOf("k")).toBe("base");
    expect(game.state("k")).toMatchObject({ damage: 0, might: 4, zone: "base" });
    expect(game.state("f")).toMatchObject({ might: 2, mightModifier: 0, zone: "base" });
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.zoneOf("dg")).toBe("trash");
  });

  test("B: no refund — P1 stays on 2 energy + [chaos]; zone table B: K board, F board (2 Might), Deathgrip P1's trash (next to T), Defy P2's trash", async () => {
    const game = await lineB();
    await game.p2.cast("defy", { targets: "dg" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 1 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.p1.units("base").sort()).toEqual(["f", "k"]);
    expect(game.p1.trash().sort()).toEqual(["dg", "t"]);
    expect(game.p2.trash()).toEqual(["defy"]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("B control — unanswered: K dies AT RESOLUTION, F (the other friendly unit) gets +4 = K's Might this turn (2 → 6), P1 draws 1; Deathgrip to trash", async () => {
    const game = await board().build();
    await game.p1.cast("dg", { targets: "k" });
    const hand0 = game.p1.hand().length;
    await game.p1.passPriority();
    expect(game.zoneOf("k")).toBe("base"); // not before both have passed
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("f");
    }
    await game.settle();
    expect(game.zoneOf("k")).toBe("trash");
    expect(game.state("f")).toMatchObject({ might: 6, zone: "base" });
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.zoneOf("dg")).toBe("trash");
    // 'this turn': gone after the turn ends
    await game.advanceTurn();
    expect(game.state("f").might).toBe(2);
  });

  // ── the contrast in one line ───────────────────────────────────────────────────────────────

  test("A vs B side by side: the same Defy leaves K in the TRASH when the kill was Heedless's cost, and on the BOARD when the kill was Deathgrip's instruction", async () => {
    const a = await lineA();
    await a.p2.cast("defy", { targets: "hr" });
    await a.settle();
    const b = await lineB();
    await b.p2.cast("defy", { targets: "dg" });
    await b.settle();
    expect([a.zoneOf("k"), b.zoneOf("k")]).toEqual(["trash", "base"]);
    expect([a.zoneOf("hr"), b.zoneOf("dg")]).toEqual(["trash", "trash"]);
    expect([a.zoneOf("t"), b.zoneOf("t")]).toEqual(["trash", "trash"]);
  });
});
