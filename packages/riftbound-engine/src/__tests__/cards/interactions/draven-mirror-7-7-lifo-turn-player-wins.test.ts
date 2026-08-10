/**
 * Interaction: Draven, Audacious (sfd-148-221) · Champion Unit · Chaos · 6 · 6 Might
 *     "[Deflect] The first time I win a combat each turn, you score 1 point.
 *      When I die in combat, choose an opponent. They score 1 point."
 *   × Draven, Audacious (sfd-148-221) — the mirror: one on each side of the same combat.
 *
 * Rules: 485.3 (Duel Victory Score 8), 466.1 / 323.4 / 323.5 (Combat Cleanup notes both death triggers and
 * trashes both units), 466.3.d + 466.5.b (neither side has units → No Result: nobody "won a combat"; the
 * battlefield becomes Uncontrolled, no Conquer), 383.3.d.1 (simultaneous triggers under different
 * controllers: the TURN PLAYER puts theirs on the chain first, the other player's goes on top), 340.1 (LIFO),
 * 319.5 (a Cleanup after each item leaves the chain), 323.1 / 472 / 194.2 (win check in that Cleanup: ≥ 8 AND
 * strictly more than any opponent; 194.2.a/.b — a tie at/above 8 plays on), 471.1.a.1 / 194.1.c (a
 * triggered-ability point is not a Conquer → no Final-Point restriction).
 *
 * Q / expected:
 *   (a) both on 7, P1's turn, P1's Draven attacks P2's Draven at bfA → both die; P2's trigger (on top)
 *       resolves first → P1 8 → Cleanup: P1 WINS on the spot; P1's own trigger never matters. Not 8-8.
 *   (b) same 7-7 but P2's turn / P2 attacks → P1's trigger on top → P2 8 → P2 wins. Turn order decides.
 *   (c) P1 6, P2 7, P1's turn → P1 7 (no win), then P2 8 → P2 wins during P1's turn.
 *   (d) 6-6 → 7-7, no winner, bfA Uncontrolled, P1's open main phase.
 *   In every variant "choose an opponent" resolves to the single opponent (auto / one-option), exactly one
 *   point per trigger.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAVEN = "sfd-148-221";

/**
 * Victory 8. `active`'s Draven ("dAtk") sits ready in base; the other player controls bfA with their own
 * Draven ("dDef") as the lone defender. No resources, no tricks.
 */
function board(o: { p1: number; p2: number; active?: Seat }) {
  const active = o.active ?? P1;
  const defender = active === P1 ? P2 : P1;
  return scenario()
    .turn(3)
    .active(active)
    .victoryScore(8)
    .points(P1, o.p1)
    .points(P2, o.p2)
    .battlefield("bfA", { controller: defender })
    .unit(defender, "bfA", DRAVEN, "dDef")
    .unit(active, "base", DRAVEN, "dAtk");
}

/** The turn player's Draven attacks bfA and both players pass Focus → damage is dealt, Combat Cleanup runs. */
async function clash(game: Game): Promise<void> {
  const tp = game.turnPlayer();
  const np = tp === P1 ? P2 : P1;
  expect(game.state("dAtk").might).toBe(6);
  expect(game.state("dDef").might).toBe(6);
  await game.seat(tp).move("dAtk", "bfA");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: tp });
  await game.seat(tp).passFocus();
  await game.seat(np).passFocus();
}

/** Record every non-action prompt anybody is shown (to prove no stray / double "choose an opponent"). */
function recordPrompts(game: Game): Decision[] {
  const seen: Decision[] = [];
  const rec = (d: Decision) => {
    if (d.kind !== "action") {
      seen.push(d);
    }
    return undefined;
  };
  game.script(P1, [rec]);
  game.script(P2, [rec]);
  return seen;
}

describe("Draven, Audacious mirror — simultaneous 'they score 1' death triggers, LIFO, turn player wins the race", () => {
  // ── shared mechanics (observed on the 6-6 board so nothing ends early) ─────────────────────────
  test("both Dravens take 6 simultaneously and go to their OWNERS' trashes (466.1, 323.5)", async () => {
    const game = await board({ p1: 6, p2: 6 }).build();
    await clash(game);
    expect(game.zoneOf("dAtk")).toBe("trash");
    expect(game.zoneOf("dDef")).toBe("trash");
    expect(game.p1.trash()).toEqual(["dAtk"]);
    expect(game.p2.trash()).toEqual(["dDef"]);
  });

  test("383.3.d.1 ordering on P1's turn: P1's (turn player's) trigger goes on the chain FIRST, P2's on TOP — chain bottom→top = [dAtk/P1, dDef/P2]; the top item's controller (P2) holds priority first", async () => {
    const game = await board({ p1: 6, p2: 6 }).build();
    await clash(game);
    expect(game.chain().map((c) => [c.cardId, c.controller, c.triggered])).toEqual([
      ["dAtk", P1, true],
      ["dDef", P2, true],
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.points()).toBe(6);
    expect(game.p2.points()).toBe(6); // nothing scored before resolution
  });

  test("LIFO (340.1): P2's trigger resolves first and its only legal 'opponent' is P1 → P1 +1; then P1's resolves → P2 +1 — exactly one point each, never two, never zero", async () => {
    const game = await board({ p1: 6, p2: 6 }).build();
    await clash(game);
    await game.p2.passPriority();
    await game.p1.passPriority(); // top item (P2's) resolves
    expect(game.p1.points()).toBe(7);
    expect(game.p2.points()).toBe(6);
    expect(game.chain().map((c) => c.cardId)).toEqual(["dAtk"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // P1's resolves
    expect(game.p1.points()).toBe(7);
    expect(game.p2.points()).toBe(7);
    expect(game.chain()).toEqual([]);
  });

  test("'choose an opponent' in a duel: no multi-option prompt is ever surfaced to either player (the lone opponent is bound), and settle() never stalls on it", async () => {
    const game = await board({ p1: 6, p2: 6 }).build();
    const seen = recordPrompts(game);
    await clash(game);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    // Any prompt that did appear must have been a forced single option; none may offer the chooser themself.
    for (const d of seen) {
      expect(d.kind).toBe("pick");
      if (d.kind === "pick") {
        expect(d.options).toHaveLength(1);
        expect(d.options[0]?.seatRef ?? d.options[0]?.key).not.toBe(d.seat);
      }
    }
    expect(game.p1.points() + game.p2.points()).toBe(14); // 6+6 → 7+7: one point per trigger
  });

  // ── (a) 7-7, P1's turn ──────────────────────────────────────────────────────────────────────────
  test("(a) 7-7 on P1's turn: P2's trigger (top) gives P1 the 8th point and the very next Cleanup ends the game — P1 WINS 8-7; it is not an 8-8 tie (383.3.d.1, 319.5, 323.1)", async () => {
    const game = await board({ p1: 7, p2: 7 }).build();
    await clash(game);
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(7);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
  });

  test("(a) P1's own trigger never gets to matter: the game is over with it still unresolved (P2 stays on 7), and it was NOT 'attacker's trigger first'", async () => {
    const game = await board({ p1: 7, p2: 7 }).build();
    await clash(game);
    // Step one priority pass at a time and watch the score after each.
    await game.p2.passPriority();
    expect(game.isOver()).toBe(false);
    await game.p1.passPriority(); // P2's item resolves → P1 8 → cleanup → win
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p2.points()).toBe(7);
    expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([["dAtk", P1]]); // stranded, unresolved
    expect(game.decision()).toBeNull();
    expect((await game.p1.try((p) => p.passPriority())).ok).toBe(false); // nothing more can happen
  });

  test("(a) the 8th point is a triggered-ability point, not a Conquer: no Final-Point restriction, no card drawn instead (471.1.a.1, 194.1.c); bfA was not conquered by anyone", async () => {
    const game = await board({ p1: 7, p2: 7 }).build();
    const hand0 = game.p1.hand().length;
    await clash(game);
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.gameState.battlefields.bfA?.controller).not.toBe(P1);
    expect(game.gameState.conqueredThisTurn?.[P1] ?? []).toEqual([]);
  });

  // ── (b) 7-7, P2's turn — mirror ─────────────────────────────────────────────────────────────────
  test("(b) same 7-7 board on P2's turn (P2's Draven attacks P1's): now P2 is Turn Player, so P1's trigger is on top → resolves first → P2 8 → P2 WINS 7-8 — opposite winner purely from turn order", async () => {
    const game = await board({ active: P2, p1: 7, p2: 7 }).build();
    expect(game.turnPlayer()).toBe(P2);
    await clash(game);
    expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
      ["dAtk", P2],
      ["dDef", P1],
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.winner()).toBe(P2);
    expect(game.p1.points()).toBe(7);
    expect(game.p2.points()).toBe(8);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.chain().map((c) => c.controller)).toEqual([P2]); // P2's own trigger stranded this time
  });

  // ── (c) 6-7, P1's turn ──────────────────────────────────────────────────────────────────────────
  test("(c) P1 6 / P2 7 on P1's turn: P2's trigger → P1 7 (Cleanup: nobody ≥ 8); P1's trigger → P2 8 (Cleanup: 8 > 7) → P2 wins during P1's turn with the chain fully resolved", async () => {
    const game = await board({ p1: 6, p2: 7 }).build();
    await clash(game);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.p1.points()).toBe(7);
    expect(game.p2.points()).toBe(7);
    expect(game.isOver()).toBe(false); // 7-7: no win at this cleanup
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p2.points()).toBe(8);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]);
  });

  // ── (d) 6-6 ─────────────────────────────────────────────────────────────────────────────────────
  test("(d) 6-6 → 7-7: no winner, no GameOver — the game continues in P1's Neutral Open main phase with an empty chain and empty bfA", async () => {
    const game = await board({ p1: 6, p2: 6 }).build();
    await clash(game);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.p1.points()).toBe(7);
    expect(game.p2.points()).toBe(7);
    expect(game.chain()).toEqual([]);
    expect(game.p1.units("bfA")).toEqual([]);
    expect(game.p2.units("bfA")).toEqual([]);
    expect(game.gameState.battlefields.bfA?.contested).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("endTurn")).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("(d) No Result: neither Draven 'won a combat' (first ability silent — the only points are the two death-trigger points) and nobody conquered bfA", async () => {
    const game = await board({ p1: 6, p2: 6 }).build();
    await clash(game);
    await game.settle();
    expect(game.p1.points()).toBe(7); // 6 + P2's death trigger only; no win-combat point, no conquer point
    expect(game.p2.points()).toBe(7);
    expect(game.gameState.conqueredThisTurn?.[P1] ?? []).toEqual([]);
    expect(game.gameState.battlefields.bfA?.controller).not.toBe(P1);
  });

  // rule 466.5.b — no units of any player remain at bfA after the mutual kill, so bfA becomes UNCONTROLLED
  // (controller null); consequently P2 cannot Hold it next turn and stays on 7 (operations/battlefield-control.ts).
  test("(d) with no units left bfA becomes Uncontrolled (466.5.b) — and so P2 cannot Hold it next turn (stays 7-7 into P2's main phase)", async () => {
    const game = await board({ p1: 6, p2: 6 }).build();
    await clash(game);
    await game.settle();
    expect(game.gameState.battlefields.bfA?.controller).toBeNull();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(7);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });
});
