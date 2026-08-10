/**
 * Interaction: Tryndamere, Barbarian (ogn-034-298) · Fury champion unit · 7 · 8 Might ·
 *     "When I conquer after an attack, if you assigned 5 or more excess damage to enemy units, you
 *     score 1 point."
 *   × Plundering Poro (sfd-069-221) · Mind unit · 2 · 2 Might · "When I conquer, play a Gold gear token
 *     exhausted."  — here only the 2-Might DEFENDER (its own conquer text is irrelevant)
 *
 * Rules: 466.1.a.2 / 466.3.a (sole survivor wins the combat), 466.5 / 466.5.d / 469.1 (establishing
 * control = Conquer if not yet scored there this turn), 470 (once per battlefield per turn), 471.1.b /
 * 471.1.b.1 (Final Point via CONQUER needs every battlefield scored this turn — else draw 1 instead),
 * 471.1.a.1 + 194.1.c (points from a triggered ability are not a Conquer → unrestricted), 471.2 / 471.2.a
 * (Score abilities still trigger at the battlefield that scored), 466.6 (resolve those items during
 * combat resolution), 383.2.a.1 (an "if" right after the condition is part of the trigger condition),
 * 472 / 323.1 (the win is checked at a Cleanup), 315.2.b.2 / 469.2 (Hold at the start of your turn).
 *
 * Question: 1v1 to 8, P1 at 7, battlefield A unscored by P1 (P2 holds it), P2's lone Poro on B.
 * Tryndamere attacks B alone, all 8 onto the Poro (6 excess), survives. (a) Does the conquer give the
 * 8th point? Is B controlled / scored-this-turn anyway? (b) Does Tryndamere still trigger and can THAT
 * point be the winner — when exactly does P1 win? (c) Contrast: a 4-Might defender (4 excess). (d)
 * Contrast: P1 starts at 6.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TRYNDAMERE = "ogn-034-298";
const PLUNDERING_PORO = "sfd-069-221";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * Turn 3, P1 to act, Victory Score 8. P2 controls A (a 2-Might guard) and B (the defender). Tryndamere
 * ready in P1's base. `defender: "poro"` = Plundering Poro (2 Might → 6 excess); a number = a vanilla
 * unit of that Might.
 */
function board(opts: { p1Points?: number; defender?: "poro" | number } = {}) {
  const b = scenario()
    .turn(3)
    .victoryScore(8)
    .points(P1, opts.p1Points ?? 7)
    .points(P2, 3)
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfA", { might: 2, name: "A Guard" }, "aGuard")
    .unit(P1, "base", TRYNDAMERE, "trynd");
  const def = opts.defender ?? "poro";
  return def === "poro"
    ? b.unit(P2, "bfB", PLUNDERING_PORO, "defender")
    : b.unit(P2, "bfB", { might: def, name: `Guard ${def}` }, "defender");
}

/**
 * Tryndamere attacks B; both players pass Focus; combat damage is assigned (a lone defender takes it
 * all — answer the prompt if the engine asks) — and STOP at the first priority window after the
 * combat result, i.e. with any conquer trigger still on the chain.
 */
async function attackAndResolveCombat(game: Game): Promise<void> {
  await game.p1.move("trynd", "bfB");
  await game.p1.passFocus();
  await game.p2.passFocus();
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "distribute") {
      await game.seat(d.seat).distribute({ ...(d.defaultAllocation ?? { defender: d.total }) });
    } else if (d?.kind === "action" && d.context === "procedure" && d.options[0]) {
      await game.seat(d.seat).choose(d.options[0].key);
    } else {
      return;
    }
  }
}

describe("Tryndamere, Barbarian — conquer at Victory‑1 and the trigger's eighth point", () => {
  // ── (a) the conquer itself at 7/8 ─────────────────────────────────────────────────────────

  test("(a) combat: the Poro dies, Tryndamere survives and stays; P1 establishes control of B = a Conquer, B is 'scored this turn' — but the conquer point becomes DRAW 1 (471.1.b.1: A is unscored)", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await attackAndResolveCombat(game);
    expect(game.zoneOf("defender")).toBe("trash");
    expect(game.zoneOf("trynd")).toBe("battlefield-bfB");
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["bfB"]);
    expect(game.gameState.conqueredThisTurn?.[P1]).toEqual(["bfB"]);
    expect(game.p1.points()).toBe(7); // no 8th point from the conquer …
    expect(game.p1.hand()).toHaveLength(hand0 + 1); // … a card instead
    expect(game.isOver()).toBe(false);
  });

  // ── (b) the trigger still fires and wins ──────────────────────────────────────────────────

  test("(b) scoring B still TRIGGERS Tryndamere (471.2/.2.a; 6 ≥ 5 excess): his ability is on the chain in the 466.6 window while P1 sits at 7 with the extra card, game not over yet", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await attackAndResolveCombat(game);
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "trynd", controller: P1, triggered: true });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
  });

  test("(b) the trigger's 'you score 1 point' is NOT a Conquer (194.1.c) so the Final-Point restriction does not apply (471.1.a.1): it resolves → 8, and the following Cleanup ends the game — P1 wins on their own turn, mid combat-resolution (472/323.1)", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await attackAndResolveCombat(game);
    await game.p1.passPriority();
    expect(game.isOver()).toBe(false); // still on the chain until P2 passes too
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand()).toHaveLength(hand0 + 1); // the draw from (a) stands; no second draw
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("(b) one-shot: move + settle() reaches the same end state — Poro in trash, B controlled by P1, P1 on 8, game over, P1 wins", async () => {
    const game = await board().build();
    await game.p1.move("trynd", "bfB");
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.zoneOf("defender")).toBe("trash");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(3);
    expect(game.winner()).toBe(P1);
  });

  // ── (c) only 4 excess ─────────────────────────────────────────────────────────────────────

  test("(c) vs a 4-Might defender (4 excess) the 'if 5+ excess' trigger condition fails — nothing goes on the chain (383.2.a.1); P1 draws 1, stays at 7, controls B, game continues", async () => {
    const game = await board({ defender: 4 }).build();
    const hand0 = game.p1.hand().length;
    await attackAndResolveCombat(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defender")).toBe("trash");
    expect(game.zoneOf("trynd")).toBe("battlefield-bfB");
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.isOver()).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(c) …but simply HOLDING B at the start of P1's next turn scores the 8th point — Hold is not subject to the Final-Point restriction (315.2.b.2, 469.2, 471.1.a.1) — and P1 wins in that Beginning Phase", async () => {
    const game = await board({ defender: 4 }).build();
    await game.p1.move("trynd", "bfB");
    await game.settle();
    expect(game.p1.points()).toBe(7);
    await game.advanceTurn(); // → P2's turn; P2 does nothing about B
    expect(game.turnPlayer()).toBe(P2);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    await game.p2.endTurn(); // → P1's Beginning Phase: Scoring Step holds B
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(8);
    expect(game.winner()).toBe(P1);
  });

  // ── (d) starting from 6 ───────────────────────────────────────────────────────────────────

  test("(d) from 6: the conquer point is gained normally FIRST (→ 7, no draw), and only then is Tryndamere's trigger waiting on the chain", async () => {
    const game = await board({ p1Points: 6 }).build();
    const hand0 = game.p1.hand().length;
    await attackAndResolveCombat(game);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand0); // a real point, not a card
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "trynd", triggered: true });
    expect(game.isOver()).toBe(false);
  });

  test("(d) …the trigger then resolves in the 466.6 window → 8 (unrestricted) → P1 wins at the next Cleanup, still turn 3", async () => {
    const game = await board({ p1Points: 6 }).build();
    const hand0 = game.p1.hand().length;
    await attackAndResolveCombat(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.turnNumber()).toBe(3);
    expect(game.violations()).toEqual([]);
  });
});
