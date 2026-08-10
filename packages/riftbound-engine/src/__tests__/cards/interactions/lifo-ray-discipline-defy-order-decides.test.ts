/**
 * Interaction: chain order (LIFO) is outcome-determinative.
 *   Hextech Ray (ogn-009-298) · Fury spell [1]+[fury] · "[Action] Deal 3 to a unit at a battlefield."
 *   × Discipline (ogn-058-298) · Calm spell [2] · "[Reaction] Give a unit +2 [Might] this turn. Draw 1."
 *   × Defy (ogn-045-298) · Calm spell [1]+[calm] · "[Reaction] Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Question: P1's turn; P2's 3-Might unit X at bf1. Chain: P1 Hextech Ray → X, P1 passes; P2 Discipline
 * → X, P2 passes; P1 Defy → Discipline, P1 passes, P2 passes. (a) chain listing + priority holder at each
 * of the three windows; (b) resolve newest-first — after each resolution, Finalize or priority to whom?
 * does X die? (c) same cards but no Defy: does X die? (d) show the order decides: FIFO would kill X in
 * both lines; Defy is only useful because it sits ABOVE Discipline — once Discipline has resolved a late
 * Defy can only target P1's own Ray.
 *
 * Rules: 337.4 (the player who finalized an item keeps priority), 338.1.b.1 / 339.2 (pass → next player
 * in turn order), 339.1 (all pass in sequence with no additions → resolve), 340.1 (resolve the NEWEST
 * item), 340.3/340.4 (items remain → priority to the controller of the new newest item), 340.2/335 (chain
 * empty → Open, turn player acts), 425.1.a (countered: no effect, costs not refunded, card → trash),
 * 359.3.c / 355.9 (Defy needs "a spell" ON the chain), 317.2.b/.c (damage heals and "this turn" lapses
 * at end of turn), 323.5 (lethal damage kills at the next Cleanup).
 *
 * Expected: (a) W1 [Ray] prio P1→P2; W2 [Ray, Discipline] prio P2→P1; W3 [Ray, Discipline, Defy] prio
 * P1→P2→resolve. (b) Defy resolves: Discipline countered → P2's trash, no draw, no refund; chain [Ray] →
 * priority P1 (340.4); pass/pass → Ray: 3 to 3-Might X → X dies. (c) Discipline resolves first: X = 5,
 * P2 draws 1 → priority P1 → pass/pass → Ray: 3 on 5 → X survives with 3 damage, heals / +2 lapses at
 * end of turn. (d) after Discipline resolved, Defy's only offered target is P1's own Hextech Ray.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";
const DISCIPLINE = "ogn-058-298";
const DEFY = "ogn-045-298";

/** P1's turn 2. X (P2, 3 Might) at P2's bf1. Both players hold exactly what their spells cost. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1, fury: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Unit X" }, "x")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P1, DEFY, "defy")
    .hand(P2, DISCIPLINE, "discipline");
}

/** Chain bottom→top as "Name/controller→target". */
const chainView = (game: Game): string[] =>
  game.chain().map((i) => `${i.name}/${i.controller}${i.targets?.length ? `→${i.targets.join(",")}` : ""}`);

const priorityHolder = (game: Game): string | undefined => {
  const d = game.decision();
  return d?.kind === "action" && d.context === "chain" ? d.seat : undefined;
};

/** Cards Defy may currently be cast on (flattened `targets` field), [] when Defy is not castable. */
function defyTargets(game: Game): string[] {
  const field = game.p1.option("cast", "defy")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

/** W1 + W2: Ray → X, P1 passes; Discipline → X, P2 passes. Priority is now P1's with two items stacked. */
async function rayThenDiscipline(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ray", { targets: "x" });
  await game.p1.passPriority();
  await game.p2.cast("discipline", { targets: "x" });
  await game.p2.passPriority();
  return game;
}

describe("Hextech Ray × Discipline × Defy — LIFO resolution decides whether X dies", () => {
  // ── (a) the three priority windows ────────────────────────────────────────────────────

  test("(a) W1: after Hextech Ray finalizes the chain is [Ray→X] and P1, who played it, holds priority (337.4); P1's pass hands it to P2 (339.2)", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "x" });
    expect(chainView(game)).toEqual([`Hextech Ray/${P1}→x`]);
    expect(priorityHolder(game)).toBe(P1);
    expect(game.state("x").damage).toBe(0); // nothing has resolved
    await game.p1.passPriority();
    expect(priorityHolder(game)).toBe(P2);
    expect(game.p2.can("cast", "discipline")).toBe(true); // Reaction — legal in the Closed state
  });

  test("(a) W2: Discipline is appended ABOVE Ray — [Ray→X, Discipline→X]; P2 holds priority, passes → P1", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "x" });
    await game.p1.passPriority();
    await game.p2.cast("discipline", { targets: "x" });
    expect(chainView(game)).toEqual([`Hextech Ray/${P1}→x`, `Discipline/${P2}→x`]);
    expect(priorityHolder(game)).toBe(P2);
    expect(game.state("x").might).toBe(3); // Discipline has not resolved — P2's pass alone does not resolve it
    await game.p2.passPriority();
    expect(priorityHolder(game)).toBe(P1);
    expect(chainView(game)).toHaveLength(2);
  });

  test("(a) W3: Defy may target Discipline (cost [2] ≤ [4] and no power ≤ [rainbow]) — or P1's own Ray; cast on Discipline it tops the chain and P1 keeps priority", async () => {
    const game = await rayThenDiscipline();
    expect(defyTargets(game)).toEqual(["discipline", "ray"]);
    await game.p1.cast("defy", { targets: "discipline" });
    expect(chainView(game)).toEqual([`Hextech Ray/${P1}→x`, `Discipline/${P2}→x`, `Defy/${P1}→discipline`]);
    expect(priorityHolder(game)).toBe(P1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    await game.p1.passPriority();
    expect(priorityHolder(game)).toBe(P2);
    expect(chainView(game)).toHaveLength(3); // still nothing resolved until P2 also passes (339.1)
  });

  // ── (b) resolve newest-first with Defy ────────────────────────────────────────────────

  test("(b) all pass → Defy (newest) resolves FIRST (340.1): Discipline is countered — to P2's trash, no draw, [2] not refunded (425.1.a); chain = [Ray]", async () => {
    const game = await rayThenDiscipline();
    await game.p1.cast("defy", { targets: "discipline" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.p2.trash()).toContain("discipline");
    expect(game.p2.hand()).toEqual([]); // Discipline was P2's only card; countered → no draw
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} }); // no refund
    expect(game.state("x")).toMatchObject({ damage: 0, might: 3 }); // no +2, Ray not yet resolved
    expect(chainView(game)).toEqual([`Hextech Ray/${P1}→x`]);
  });

  test("(b) items remain → NOT finalize-and-open: priority goes to the controller of the new newest item, Hextech Ray = P1 (340.4)", async () => {
    const game = await rayThenDiscipline();
    await game.p1.cast("defy", { targets: "discipline" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(priorityHolder(game)).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(b) P1 pass, P2 pass → Hextech Ray resolves: 3 damage to 3-Might X → X is killed at the Cleanup; chain empty → Open, P1 (turn player) acts (340.2/335)", async () => {
    const game = await rayThenDiscipline();
    await game.p1.cast("defy", { targets: "discipline" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Defy resolves
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ray resolves
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) same cards, no Defy ───────────────────────────────────────────────────────────

  test("(c) without Defy: P1's pass after W2 completes the pass sequence → Discipline (newest) resolves FIRST: X = 5 Might, P2 draws 1; Ray still waits below", async () => {
    const game = await rayThenDiscipline();
    const p2Hand = game.p2.hand().length; // 0 — Discipline is on the chain
    await game.p1.passPriority();
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.state("x")).toMatchObject({ damage: 0, might: 5 });
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(chainView(game)).toEqual([`Hextech Ray/${P1}→x`]);
    expect(priorityHolder(game)).toBe(P1); // 340.4 again: Ray's controller
  });

  test("(c) pass/pass → Hextech Ray: 3 damage on a 5-Might X → X SURVIVES at bf1 with 3 damage", async () => {
    const game = await rayThenDiscipline();
    await game.p1.passPriority(); // Discipline resolves
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ray resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("x")).toMatchObject({ damage: 3, might: 5, zone: "battlefield-bf1" });
    expect(game.p2.units("bf1")).toEqual(["x"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) X heals at end of turn before/as the +2 lapses (317.2.b/.c) — on P2's turn X is an undamaged 3-Might unit still at bf1", async () => {
    const game = await rayThenDiscipline();
    await game.p1.passPriority();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("x")).toMatchObject({ damage: 0, might: 3, zone: "battlefield-bf1" });
  });

  // ── (d) order is outcome-determinative ────────────────────────────────────────────────

  test("(d) the ONLY difference between (b) dead and (c) alive is what resolved before Ray: in both lines Ray is the oldest item and resolves LAST (340.1) — under FIFO Ray (3) would have hit a 3-Might X first in line (c) too", async () => {
    // Line (c) at the moment Ray resolves: X already reads 5 because Discipline (newer) went first.
    const c = await rayThenDiscipline();
    await c.p1.passPriority(); // Discipline resolves first
    expect(c.state("x").might).toBe(5);
    expect(chainView(c)).toEqual([`Hextech Ray/${P1}→x`]); // Ray was played first, resolves last
    // Line (b) at the moment Ray resolves: X reads 3 because Defy (newest) stripped Discipline first.
    const b = await rayThenDiscipline();
    await b.p1.cast("defy", { targets: "discipline" });
    await b.p1.passPriority();
    await b.p2.passPriority();
    expect(b.state("x").might).toBe(3);
    expect(chainView(b)).toEqual([`Hextech Ray/${P1}→x`]);
  });

  test("(d) Defy must sit ABOVE Discipline: once Discipline has resolved it is no longer 'a spell' on the chain (355.9/359.3.c) — a late Defy is offered ONLY P1's own Hextech Ray, and Discipline is rejected as a target", async () => {
    const game = await rayThenDiscipline();
    await game.p1.passPriority(); // Discipline resolves; P1 has priority over [Ray]
    expect(priorityHolder(game)).toBe(P1);
    expect(game.p1.can("cast", "defy")).toBe(true);
    expect(defyTargets(game)).toEqual(["ray"]);
    await expect(game.p1.cast("defy", { targets: "discipline" })).rejects.toThrow();
    expect(game.zoneOf("defy")).toBe("hand");
    expect(game.state("x").might).toBe(5); // the buff already landed — nothing left to counter
  });
});
