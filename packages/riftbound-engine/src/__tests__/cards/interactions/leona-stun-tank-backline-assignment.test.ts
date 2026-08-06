/**
 * Interaction: Leona, Determined (ogn-238-298) 4 Might, "[Shield] When I attack, stun an enemy unit here."
 *   × Sunlit Guardian (ogn-054-298) 3 Might, [Shield] [Tank]
 *   × Enthusiastic Promoter (unl-043-219) 2 Might, [Backline]
 *
 * Question: P1's Leona moves alone into P2's battlefield held by Sunlit Guardian + Enthusiastic
 * Promoter. (a) Leona stuns the Guardian: how is damage summed/assigned, who dies, who holds?
 * Does stunning the Tank let P1 skip it or lower its lethal threshold? (b) Leona stuns the
 * Promoter instead — outcome?
 *
 * Rules: 383.4.e / 464.2.e (attack trigger on the combat chain); 423.1.b (a stunned unit
 * contributes no Might to combat damage); 423.1.c (a stunned unit still needs its full Might in
 * damage to die); 814.1.c / 814.1.d.1 (Shield +1 only while defending — Leona's is off, Guardian's
 * is on); 815.1.b + 465.2.c.3/6/10 (Tank must be assigned lethal first; stun does not exempt it);
 * 826.3 (Backline assigned last); 465.2.a/b (sums dealt simultaneously); 466.1.a.1 (survivors
 * healed), 466.1.a.2 / 466.3.d (attackers recalled if a defender remains → no conquer).
 *
 * Expected (a): attackers 4; defenders 0 (stunned Guardian) + 2 = 2. All 4 must go to the Tank
 * Guardian, lethal = 3+1 Shield = 4 → Guardian dies, Promoter takes 0. Leona takes 2, survives,
 * is healed and recalled (Promoter still defends); P2 keeps bf1.
 * Expected (b): defenders 3+1 + 0 = 4 → lethal to Leona; her 4 still goes to the Guardian first
 * (exactly lethal). Leona and Guardian both die, Promoter survives, P2 keeps bf1.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LEONA = "ogn-238-298";
const GUARDIAN = "ogn-054-298";
const PROMOTER = "unl-043-219";

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", LEONA, "leona")
    .unit(P2, "bf1", GUARDIAN, "guardian")
    .unit(P2, "bf1", PROMOTER, "promoter");
}

/** Leona attacks alone; both players pass on her trigger; P1 picks the stun target. Stops in the showdown. */
async function attackAndStun(game: G, target: "guardian" | "promoter"): Promise<void> {
  await game.p1.move("leona", "bf1");
  const r = await game.settle(); // passes priority on the trigger → target prompt
  expect(r.reason).toBe("unanswered");
  expect(game.decision()?.kind).toBe("pick");
  expect(game.actingSeat()).toBe(P1);
  await game.p1.pick(target);
}

describe("Leona, Determined × Sunlit Guardian × Enthusiastic Promoter — stun vs Tank/Backline assignment", () => {
  test("Leona's 'When I attack' trigger goes on the chain and offers exactly the enemy units here (Guardian, Promoter)", async () => {
    const game = await board().build();
    await game.p1.move("leona", "bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["leona"]);
    expect(game.chain()[0]?.triggered).toBe(true);
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(d?.kind).toBe("pick");
    const offered = d && d.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["guardian", "promoter"]);
  });

  // ---- (a) stun the Tank/Shield Guardian -------------------------------------------------------

  test("(a) picking Sunlit Guardian stuns it (and only it) before combat damage", async () => {
    const game = await board().build();
    await attackAndStun(game, "guardian");
    expect(game.state("guardian").isStunned).toBe(true);
    expect(game.state("promoter").isStunned).toBe(false);
    expect(game.state("leona").isStunned).toBe(false);
    // Still in the showdown — nothing has died yet.
    expect(game.zoneOf("guardian")).toBe("battlefield-bf1");
    expect(game.zoneOf("leona")).toBe("battlefield-bf1");
  });

  test("(a) stun neither removes Tank nor lowers the lethal threshold: all 4 of Leona's damage goes to the Guardian (3+1 Shield = lethal), it dies, Backline Promoter is untouched", async () => {
    const game = await board().build();
    await attackAndStun(game, "guardian");
    await game.settle();
    expect(game.zoneOf("guardian")).toBe("trash");
    expect(game.zoneOf("promoter")).toBe("battlefield-bf1");
    expect(game.state("promoter").damage).toBe(0);
  });

  // Expected: the stunned Guardian contributes 0 (423.1.b), so defenders deal only the Promoter's 2
  // to Leona (4 Might) — she survives, is healed in cleanup and recalled because a defender remains.
  // Actual: combat resolution ignores the stun; defenders deal 4+2 = 6 and Leona dies.
  test("(a) a stunned defender deals no combat damage — Leona takes only 2, survives, is healed and recalled to base (423.1.b, 466.1.a.1-2)", async () => {
    const game = await board().build();
    await attackAndStun(game, "guardian");
    await game.settle();
    expect(game.p1.trash()).not.toContain("leona");
    expect(game.zoneOf("leona")).toBe("base");
    expect(game.state("leona").damage).toBe(0);
  });

  test("(a) no conquer: a defender (Promoter) remains, so P2 keeps bf1 and P1 scores nothing", async () => {
    const game = await board().build();
    await attackAndStun(game, "guardian");
    await game.settle();
    expect(game.p2.units("bf1")).toContain("promoter");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
  });

  // ---- (b) stun the Backline Promoter instead --------------------------------------------------

  test("(b) picking Enthusiastic Promoter stuns it; the Guardian is left able to deal damage", async () => {
    const game = await board().build();
    await attackAndStun(game, "promoter");
    expect(game.state("promoter").isStunned).toBe(true);
    expect(game.state("guardian").isStunned).toBe(false);
  });

  test("(b) Guardian's 3+1 Shield = 4 is lethal to Leona while her 4 (Tank first) is exactly lethal to the Guardian: both die, Promoter survives", async () => {
    const game = await board().build();
    await attackAndStun(game, "promoter");
    await game.settle();
    expect(game.zoneOf("leona")).toBe("trash");
    expect(game.zoneOf("guardian")).toBe("trash");
    expect(game.zoneOf("promoter")).toBe("battlefield-bf1");
    expect(game.state("promoter").damage).toBe(0);
  });

  test("(b) P2 retains the battlefield; Leona is in the trash rather than recalled; no points for P1", async () => {
    const game = await board().build();
    await attackAndStun(game, "promoter");
    await game.settle();
    expect(game.p1.base()).not.toContain("leona");
    expect(game.p1.trash()).toContain("leona");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.chain()).toEqual([]);
  });
});
