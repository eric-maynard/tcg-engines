/**
 * Interaction: Yasuo, Windrider (ogn-205-298) "[Ganking] The third time I move in a turn, you score
 *   1 point."
 *   × Ride the Wind (ogn-173-298) "[Action] Move a friendly unit and ready it."
 *   × Plundering Poro (sfd-069-221) 2 Might, "When I conquer, play a Gold gear token exhausted."
 *
 * Board: 1v1, Victory Score 8. Battlefield A empty & uncontrolled; battlefield B held by P2 with a lone
 * Plundering Poro. P1's turn, Neutral Open, ready Yasuo (4) in base, Ride the Wind in hand.
 * Line: (1) Standard Move Yasuo base→A; (2) once A settles, Ride the Wind Yasuo A→B (readied);
 *       (3) after B's combat, Ganking Standard Move Yasuo B→A.
 *
 * Questions: (i) P1 at 7 — point or draw at A? Is A still "scored" after Yasuo leaves and A lapses?
 * Does conquering B then award the Final Point? (ii) P1 at 5 — points after A, after B, and does
 * Yasuo's third-move trigger provide the winning 8th point? (iii) Does re-arriving at A conquer/score
 * it again, draw at 7+, or re-trigger anything?
 *
 * Rules: 190.3.a.1 (arriving at an uncontrolled battlefield applies Contested), 323.8 / 323.12 / 344.2
 * / 345 (Cleanup stages and begins the non-combat Showdown, mover has Focus), 348.2.a / 348.2.a.1
 * (sole remaining player establishes control → Conquer only if not yet scored there this turn),
 * 471.1.b.1 (at Victory−1 a Conquer gives the Final Point only if every battlefield was scored this
 * turn, else draw 1), 470 (score once per battlefield per turn), 323.6 (control lapses when empty in
 * an Open State), 446.1 / 449 (an effect relocation is a Move), 323.9 / 323.13 / 466.3.a / 466.5.d
 * (combat: attacker wins, establishes control → Conquer), 144.4.c.1 / 810 (Ganking standard move
 * battlefield→battlefield), 471.1.a.1 (non-Conquer points ignore the Final-Point restriction),
 * 471.2.c (score triggers once per battlefield per turn), 472 / 323.1 (reaching the Victory Score wins).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-205-298";
const RIDE_THE_WIND = "ogn-173-298";
const PLUNDERING_PORO = "sfd-069-221";

function board(points: number) {
  return scenario()
    .victoryScore(8)
    .points(P1, points)
    .resources(P1, { energy: 2, power: { chaos: 1 } }) // Ride the Wind: 2 energy + [chaos]
    .battlefield("bfA", { controller: null })
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfB", PLUNDERING_PORO, "poro")
    .unit(P1, "base", YASUO, "yasuo")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Step 1: Standard Move base→A and let the non-combat showdown close (both pass). */
async function step1(game: Game): Promise<void> {
  await game.p1.move("yasuo", "bfA");
  await game.settle(); // hands the auto-begun showdown back once …
  await game.settle(); // … then passes focus for both
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
}

/** Step 2: Ride the Wind on Yasuo, destination B; settle through the combat at B. */
async function step2(game: Game): Promise<void> {
  await game.p1.cast("rtw", { targets: "yasuo" });
  const r = await game.settle();
  if (!game.isOver() && r.reason === "unanswered") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("battlefield-bfB");
    await game.settle();
    if (!game.isOver()) {
      await game.settle();
    }
  }
}

/** Step 3: Ganking Standard Move B→A; settle the trigger and the showdown at A. */
async function step3(game: Game): Promise<void> {
  await game.p1.gank("yasuo", "bfA");
  await game.settle();
  if (!game.isOver()) {
    await game.settle();
  }
}

describe("Yasuo × Ride the Wind — two conquers and the Final Point (Victory Score 8)", () => {
  test("step 1 mechanics: Yasuo's arrival marks uncontrolled A as Contested by P1 and the Cleanup begins a NON-combat showdown at once with P1 holding Focus (190.3.a.1, 323.8/323.12, 345)", async () => {
    const game = await board(5).build();
    await game.p1.move("yasuo", "bfA");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.state("yasuo").isExhausted).toBe(true); // the Standard Move exhausts
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bfA" });
    expect(game.gameState.interaction?.showdownStack?.at(-1)?.isCombatShowdown).not.toBe(true);
  });

  test("(i) at 7: closing A's showdown conquers A (P1 controls it, A is marked scored this turn) but P1 has not scored EVERY battlefield → draws 1 instead of the point, stays at 7 (348.2.a.1, 471.1.b.1)", async () => {
    const game = await board(7).build();
    const hand = game.p1.hand().length;
    await step1(game);
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["bfA"]);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.isOver()).toBe(false);
  });

  test("(i) at 7, step 2: Ride the Wind is a legal Action on P1's turn; it moves Yasuo A→B (A is not offered as a destination) and READIES him; A, now empty, lapses to uncontrolled yet stays 'scored this turn' (323.6, 470)", async () => {
    const game = await board(7).build();
    await step1(game);
    expect(game.p1.can("cast", "rtw")).toBe(true);
    await game.p1.cast("rtw", { targets: "yasuo" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["base", "battlefield-bfB"]);
    await game.p1.pick("battlefield-bfB");
    // The destination is locked with the play; the spell waits on the chain, Yasuo has not moved yet.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rtw", controller: P1 })]);
    expect(game.locationOf("yasuo")).toBe("bfA");
    await game.settle(); // resolves → moves + readies → Cleanup → combat at B auto-resolves
    if (!game.isOver()) {
      await game.settle();
    }
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("yasuo")).toBe("bfB");
    expect(game.state("yasuo").isReady).toBe(true); // readied by Ride the Wind; combat does not exhaust
    expect(game.gameState.battlefields.bfA?.controller).toBeNull();
    expect(game.gameState.scoredThisTurn?.[P1]).toContain("bfA");
  });

  test("(i) at 7, combat at B: Yasuo 4 kills the Poro 2 and survives healed; P1 conquers B — now EVERY battlefield is scored this turn → the Final Point: 8, game over, P1 wins (466.3.a, 466.5.d, 471.1.b.1, 472)", async () => {
    const game = await board(7).build();
    const hand = game.p1.hand().length;
    await step1(game);
    await step2(game);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.locationOf("yasuo")).toBe("bfB");
    expect(game.state("yasuo").damage).toBe(0);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.gameState.scoredThisTurn?.[P1]?.slice().sort()).toEqual(["bfA", "bfB"]);
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand()).toHaveLength(hand + 1 - 1); // drew 1 at A, spent Ride the Wind; no second draw at B
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("(ii) at 5: A is an ordinary conquer → 6 (no draw), B is an ordinary conquer taken at 6 → 7 (the Victory−1 restriction never bites); the game is NOT over yet", async () => {
    const game = await board(5).build();
    const hand = game.p1.hand().length;
    await step1(game);
    expect(game.p1.points()).toBe(6);
    expect(game.p1.hand()).toHaveLength(hand); // no draw-instead
    await step2(game);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand - 1); // only Ride the Wind left the hand
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.isOver()).toBe(false);
  });

  test("(ii) at 5, step 3: combat did not exhaust the readied Yasuo, so the Ganking move B→A is legal; it is his THIRD move this turn (standard, Ride the Wind, standard — 446.1) → his trigger goes on the chain and scores the 8th point despite being the winning point (471.1.a.1) → P1 wins", async () => {
    const game = await board(5).build();
    await step1(game);
    await step2(game);
    expect(game.state("yasuo").isReady).toBe(true);
    expect(game.p1.can("gank", "yasuo")).toBe(true);
    expect(game.p1.option("gankingMove", "yasuo")?.fields.find((f) => f.name === "toBattlefield")?.options).toEqual(["bfA"]);
    await game.p1.gank("yasuo", "bfA");
    expect(game.locationOf("yasuo")).toBe("bfA");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
    expect(game.p1.points()).toBe(7); // not yet — the trigger is a chain item
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("(ii) control: the first two moves (standard to A, Ride the Wind to B) put NO Yasuo trigger on the chain — only the third does", async () => {
    const game = await board(5).build();
    await game.p1.move("yasuo", "bfA");
    expect(game.chain()).toEqual([]);
    await game.settle();
    await game.settle();
    await game.p1.cast("rtw", { targets: "yasuo" });
    await game.settle();
    await game.p1.pick("battlefield-bfB");
    expect(game.chain().some((c) => c.cardId === "yasuo")).toBe(false);
  });

  test("(iii) at 4 (→5 at A, →6 at B, →7 from Yasuo's trigger on the way back): re-arriving at the lapsed A contests it and P1 re-establishes control when the showdown closes, but it is NOT a second Conquer — no point, no 'draw instead' at 7, no new chain items; B, left empty, lapses (348.2.a.1, 470, 471.2.c, 323.6)", async () => {
    const game = await board(4).build();
    const hand = game.p1.hand().length;
    await step1(game);
    expect(game.p1.points()).toBe(5);
    await step2(game);
    expect(game.p1.points()).toBe(6);
    await game.p1.gank("yasuo", "bfA");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    await step3Rest(game);
    expect(game.p1.points()).toBe(7); // 6 + Yasuo's trigger only
    expect(game.locationOf("yasuo")).toBe("bfA");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.battlefields.bfB?.controller).toBeNull();
    expect(game.p1.hand()).toHaveLength(hand - 1); // spent Ride the Wind; never drew
    expect(game.chain()).toEqual([]);
    expect(game.gameState.scoredThisTurn?.[P1]?.slice().sort()).toEqual(["bfA", "bfB"]); // still exactly once each
    expect(game.isOver()).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(iii) at 7-line contrast is moot (the game ended at B), so check the 5-line: after the winning trigger the state shows A merely re-contested/controlled — P1's total is exactly 8, not 9 (no extra conquer point at A)", async () => {
    const game = await board(5).build();
    await step1(game);
    await step2(game);
    await step3(game);
    expect(game.p1.points()).toBe(8);
    expect(game.winner()).toBe(P1);
  });
});

/** Settle the Yasuo trigger and the re-opened showdown at A (handed back once, then passed). */
async function step3Rest(game: Game): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (game.isOver() || (r.reason === "open" && d?.kind === "action" && d.context === "main")) {
      return;
    }
  }
}
