/**
 * Interaction: Yuumi, Magical Cat (unl-056-219) · Champion Unit · Calm · 1 Might
 *     "When I attack or defend, give one of your other units here +3 [Might] and [Tank] this turn."
 *   × Enthusiastic Promoter (unl-043-219) · Unit · 2 Might · "[Backline] … When I hold, [Buff] all units here."
 *   × Shipyard Skulker (ogn-175-298) · Unit · 3 Might (vanilla)
 *   attacked by a single vanilla 5-Might "Playful Phantom" of P1's.
 *
 * Rules: 464.2.e (defend trigger on the initial combat chain), 815.1.b (Tank = "assign me lethal FIRST"),
 * 826.3 (Backline = "assign me lethal LAST"), 826.4.b, 465.2.c.3 (lethal in full before the next unit),
 * 465.2.c.4 (no over-assignment while another unit remains), 465.2.c.6 (obey all requirements if able),
 * 465.2.c.7 (same tier → assigner's order), 465.2.c.8 (Tank AND Backline on one unit are exclusionary:
 * the ASSIGNING player picks ONE to honour — first or last, never in between; CR example: Caitlyn + Tank).
 *
 * Question: P2 defends bf1 with Yuumi (1), Promoter (2, Backline), Skulker (3). P1 attacks with Phantom (5).
 *   (a) Yuumi's trigger targets the PROMOTER (→ 5 Might, Tank + Backline). Which assignments of P1's 5 does
 *       the Decision accept / reject (specifically "Promoter in the middle"), and what happens on each line?
 *   (b) Yuumi targets the SKULKER instead (→ 6, Tank). What is forced; does anything of P2's die?
 *
 * Expected: defenders total 9 either way → Phantom always dies, P2 always keeps bf1, nobody scores.
 *   (a) Line T {Promoter 5}: Promoter dies, Yuumi/Skulker untouched. Line B {Skulker 3, Yuumi 1, Promoter 1}:
 *       Yuumi + Skulker die, Promoter survives healed. Rejected: {Skulker 3, Promoter 2}, {Yuumi 1, Promoter 4}
 *       (neither first nor last), and any overkill on one unit while others remain.
 *   (b) Skulker 6/Tank must take lethal first; 5 < 6 → all 5 on Skulker, forced (no real choice); no P2 unit
 *       dies; Yuumi's +3/Tank lapse at end of turn.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, DistributeDecision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YUUMI = "unl-056-219";
const PROMOTER = "unl-043-219";
const SKULKER = "ogn-175-298";

function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 5, name: "Playful Phantom" }, "phantom")
    .unit(P2, "bf1", YUUMI, "yuumi")
    .unit(P2, "bf1", PROMOTER, "promo")
    .unit(P2, "bf1", SKULKER, "skulker");
}

/**
 * Phantom attacks bf1; P2 answers Yuumi's defend trigger with `target`; everyone passes priority/focus
 * until either P1's damage-assignment Decision or (if the assignment was forced) the open main phase.
 */
async function attackUntilAssignment(game: Game, target: "promo" | "skulker"): Promise<Decision | null> {
  await game.p1.move("phantom", "bf1");
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main") || d.kind === "distribute") {
      return d;
    }
    if (d.kind === "pick") {
      expect(d.seat).toBe(P2);
      await game.p2.pick(target);
      continue;
    }
    if (d.kind === "action" && d.passKey) {
      await game.acting().pass();
      continue;
    }
    return d;
  }
  return game.decision();
}

function asDistribute(d: Decision | null): DistributeDecision {
  expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 5 });
  return d as DistributeDecision;
}

/** Total combat damage dealt to `target` (public damageLog). */
function dealt(game: Game, target: string): number {
  return (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === target).reduce((s, r) => s + r.amount, 0);
}

describe("Yuumi gives Tank to a Backline unit — first or last, never between (465.2.c.8)", () => {
  test("setup: Phantom's move opens the combat; Yuumi's 'when I defend' trigger is on the chain and P2 is asked for its target among her OTHER units here (Promoter, Skulker — not Yuumi, not the attacker)", async () => {
    const game = await board().build();
    expect(game.state("promo").keywords).toEqual(["Backline"]);
    await game.p1.move("phantom", "bf1");
    expect(game.state("phantom").combatRole).toBe("attacker");
    expect(game.state("yuumi").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yuumi", controller: P2, triggered: true })]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["promo", "skulker"]);
  });

  // ── (a) Promoter gets +3 and Tank ─────────────────────────────────────────────────────────────

  test("(a) targeting the Promoter: once the trigger resolves it is 5 Might with BOTH Backline and Tank (this turn); Skulker stays a plain 3, Yuumi 1", async () => {
    const game = await board().build();
    asDistribute(await attackUntilAssignment(game, "promo"));
    expect(game.state("promo").might).toBe(5);
    expect([...game.state("promo").keywords].sort()).toEqual(["Backline", "Tank"]);
    expect(game.state("promo").grantedKeywords).toContainEqual(expect.objectContaining({ duration: "turn", keyword: "Tank" }));
    expect(game.state("skulker")).toMatchObject({ keywords: [], might: 3 });
    expect(game.state("yuumi").might).toBe(1);
  });

  test("(a) P1 gets a real distribute Decision for 5 damage over the three defenders with lethal thresholds Yuumi 1 / Skulker 3 / Promoter 5", async () => {
    const game = await board().build();
    const d = asDistribute(await attackUntilAssignment(game, "promo"));
    expect(d.buckets.map((b) => [b.key, b.lethal]).sort()).toEqual([
      ["promo", 5],
      ["skulker", 3],
      ["yuumi", 1],
    ]);
  });

  test("(a) Line T — honour Tank: {Promoter 5} is legal; Promoter dies, Yuumi and Skulker take 0 and survive; Phantom dies to 1+5+3 = 9; P2 keeps bf1, no points", async () => {
    const game = await board().build();
    asDistribute(await attackUntilAssignment(game, "promo"));
    await game.p1.distribute({ promo: 5 });
    await game.settle();
    expect(dealt(game, "promo")).toBe(5);
    expect(dealt(game, "yuumi")).toBe(0);
    expect(dealt(game, "skulker")).toBe(0);
    expect(dealt(game, "phantom")).toBe(9);
    expect(game.zoneOf("promo")).toBe("trash");
    expect(game.zoneOf("phantom")).toBe("trash");
    expect(game.zoneOf("yuumi")).toBe("battlefield-bf1");
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(a) Line B — honour Backline: {Skulker 3, Yuumi 1, Promoter 1} is legal; Yuumi and Skulker die, Promoter survives (1 < 5) healed and holds bf1; Phantom dies", async () => {
    const game = await board().build();
    asDistribute(await attackUntilAssignment(game, "promo"));
    await game.p1.distribute({ promo: 1, skulker: 3, yuumi: 1 });
    await game.settle();
    expect(dealt(game, "skulker")).toBe(3);
    expect(dealt(game, "yuumi")).toBe(1);
    expect(dealt(game, "promo")).toBe(1);
    expect(game.zoneOf("yuumi")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.zoneOf("phantom")).toBe("trash");
    expect(game.zoneOf("promo")).toBe("battlefield-bf1");
    expect(game.state("promo").damage).toBe(0);
    expect(game.p2.units("bf1")).toEqual(["promo"]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // Expected (465.2.c.8): with Tank and Backline both on the Promoter, P1 must honour ONE of them —
  // Promoter FIRST (lethal 5 in full) or LAST (after Yuumi and Skulker both have lethal). {Skulker 3,
  // Promoter 2} puts the Promoter second while Yuumi is unassigned → satisfies neither → must be refused.
  // Actual: the engine treats the doubly-constrained unit as unconstrained and accepts the allocation.
  test("(a) {Skulker 3 → Promoter 2} — Promoter in the MIDDLE satisfies neither Tank nor Backline and must be rejected (465.2.c.8)", async () => {
    const game = await board().build();
    asDistribute(await attackUntilAssignment(game, "promo"));
    const r = await game.p1.try((p) => p.distribute({ promo: 2, skulker: 3 }));
    expect(r.ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1 });
  });

  // Expected (465.2.c.8 + 465.2.c.3): {Yuumi 1, Promoter 4} — Promoter neither first (Yuumi got damage
  // before the Tank had lethal) nor last (Skulker, a plain unit, has no lethal yet) → illegal.
  // Actual: accepted.
  test("(a) {Yuumi 1 → Promoter 4} — again neither first nor last while the plain Skulker is unassigned; must be rejected (465.2.c.8)", async () => {
    const game = await board().build();
    asDistribute(await attackUntilAssignment(game, "promo"));
    const r = await game.p1.try((p) => p.distribute({ promo: 4, yuumi: 1 }));
    expect(r.ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1 });
  });

  test("(a) still refused regardless of tier choice: overkill on one unit while others remain ({Skulker 5}, {Yuumi 5}, {Skulker 4, Yuumi 1}) and non-lethal-first splits ({Promoter 3, Skulker 2}, {Yuumi 2, Skulker 3}) (465.2.c.3/4)", async () => {
    const game = await board().build();
    asDistribute(await attackUntilAssignment(game, "promo"));
    const illegal: Record<string, number>[] = [{ skulker: 5 }, { yuumi: 5 }, { skulker: 4, yuumi: 1 }, { promo: 3, skulker: 2 }, { skulker: 3, yuumi: 2 }];
    for (const alloc of illegal) {
      expect((await game.p1.try((p) => p.distribute(alloc))).ok).toBe(false);
    }
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1 }); // still waiting for a legal line
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
  });

  // ── (b) Skulker gets +3 and Tank ──────────────────────────────────────────────────────────────

  test("(b) targeting the Skulker: it is 6 Might with Tank; the Promoter keeps plain Backline at 2", async () => {
    const game = await board().build();
    await attackUntilAssignment(game, "skulker");
    // The grant is 'this turn' — still visible after the combat.
    expect(game.state("skulker").might).toBe(6);
    expect(game.state("skulker").keywords).toContain("Tank");
    expect(game.state("promo").keywords).toEqual(["Backline"]);
    expect(game.state("promo").might).toBe(2);
  });

  test("(b) the assignment is forced — Tank Skulker first, 5 < 6 lethal so all 5 stay on it (465.2.c.3): P1 is never offered a real distribute choice and the marks are {Skulker 5, Yuumi 0, Promoter 0}", async () => {
    const game = await board().build();
    const d = await attackUntilAssignment(game, "skulker");
    if (d?.kind === "distribute") {
      // A degenerate prompt is tolerable only if the single legal line is the only thing it accepts.
      expect((await game.p1.try((p) => p.distribute({ promo: 1, skulker: 3, yuumi: 1 }))).ok).toBe(false);
      expect((await game.p1.try((p) => p.distribute({ yuumi: 1, skulker: 4 }))).ok).toBe(false);
      await game.p1.distribute({ skulker: 5 });
    }
    await game.settle();
    expect(dealt(game, "skulker")).toBe(5);
    expect(dealt(game, "yuumi")).toBe(0);
    expect(dealt(game, "promo")).toBe(0);
  });

  test("(b) outcome: nobody on P2's side dies (Skulker healed), Phantom dies to 1+2+6 = 9, P2 keeps bf1 uncontested, no points either way", async () => {
    const game = await board().build();
    await attackUntilAssignment(game, "skulker");
    await game.settle();
    expect(dealt(game, "phantom")).toBe(9);
    expect(game.zoneOf("phantom")).toBe("trash");
    expect([...game.p2.units("bf1")].sort()).toEqual(["promo", "skulker", "yuumi"]);
    expect(game.state("skulker").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(b) Yuumi's +3 [Might] and [Tank] are 'this turn': after the turn ends the Skulker has no Tank / no might modifier left (P2 then HOLDS bf1 → +1 point and the surviving Promoter's hold trigger buffs everyone there, so it reads 3 +1 buff = 4)", async () => {
    const game = await board().build();
    await attackUntilAssignment(game, "skulker");
    await game.settle();
    expect(game.state("skulker").might).toBe(6);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("skulker").keywords).not.toContain("Tank");
    expect(game.state("skulker").grantedKeywords).toEqual([]);
    expect(game.state("skulker").mightModifier).toBe(0);
    expect(game.p2.points()).toBe(1);
    expect(game.state("skulker")).toMatchObject({ baseMight: 3, isBuffed: true, might: 4 });
  });
});
