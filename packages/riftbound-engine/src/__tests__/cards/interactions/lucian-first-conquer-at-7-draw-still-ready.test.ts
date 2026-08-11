/**
 * Interaction: Lucian, Merciless (sfd-113-221) given [Ganking] by Bounty Hunter (ogn-267-298), conquering two
 *              empty battlefields in one turn around the Victory−1 "draw instead" rule.
 *
 *   Lucian, Merciless — Unit · Body · 3 · 3 Might · Champion
 *     "[Weaponmaster] … The first time I conquer each turn, ready me."
 *   Bounty Hunter — Legend
 *     "[Exhaust]: Give a unit [Ganking] this turn. (It can move from battlefield to battlefield.)"
 *
 * Board. 1v1, Victory 8, exactly two battlefields bf1 / bf2, both empty and Uncontrolled. P1's turn-3 main
 * phase; Bounty Hunter ready; Lucian ready in P1's base; P2 has only a bystander in base.
 * Line: exhaust Bounty Hunter → Lucian has [Ganking] this turn; Standard Move Lucian → bf1 (non-combat
 * showdown, pass/pass → conquer); with his regained ready state gank bf1 → bf2 (showdown, pass/pass → conquer).
 *
 * Expected:
 *  (a) from 3: the move exhausts Lucian (144.2); pass/pass at the Uncontrolled bf1 → P1 establishes control =
 *      Conquer (469.1) → 4, and Lucian's "first time I conquer each turn" goes on the chain (383.4.c.2.a,
 *      471.2.a) — P1's only item, no order prompt — resolves → READY. Gank to bf2 (exhausts), pass/pass →
 *      conquer → 5; second conquer this turn → condition not met (383.1) → nothing on the chain, Lucian stays
 *      EXHAUSTED at bf2. bf1, now empty, lapses to Uncontrolled (323.6) but stays "scored this turn" (470).
 *  (b) from 7: the bf1 conquer would be a point at Victory−1 without every battlefield scored → P1 DRAWS 1
 *      instead, stays at 7 (471.1.b.1) — but the Conquer happened, so Lucian's trigger STILL fires
 *      (383.4.c.2.c) → ready → gank to bf2 → conquer with {bf1, bf2} = every battlefield scored → Final Point
 *      → 8 → P1 wins (323.1 / 472). Net +1 card.
 *  (c) from 6: bf1 → 7 (unrestricted), readied; bf2 at 7 with everything scored → 8, win.
 *  (d) "each turn" resets: on P1's NEXT turn his first conquer readies him again.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LUCIAN = "sfd-113-221";
const BOUNTY_HUNTER = "ogn-267-298";

function board(p1Points: number) {
  return scenario()
    .turn(3)
    .active(P1)
    .victoryScore(8)
    .points(P1, p1Points)
    .points(P2, 0)
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .legend(P1, BOUNTY_HUNTER, "bountyHunter")
    .unit(P1, "base", LUCIAN, "lucian")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander");
}

/** Exhaust Bounty Hunter on Lucian and let the ability resolve → Lucian has [Ganking] this turn. */
async function grantGanking(game: Game): Promise<void> {
  await game.p1.activate("bountyHunter", 0, { targets: "lucian" });
  await game.settle();
  expect(game.state("bountyHunter").isExhausted).toBe(true);
  expect(game.state("lucian").grantedKeywords).toEqual([{ duration: "turn", keyword: "Ganking" }]);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
}

/** The mover holds Focus in the non-combat showdown at `bf`; both pass → it closes (348.2.a). */
async function passPass(game: Game, bf: string): Promise<void> {
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.gameState.interaction?.showdownStack?.at(-1)?.battlefieldId).toBe(bf);
  await game.p1.passFocus();
  await game.p2.passFocus();
}

/** Both players pass priority on whatever single item is on the chain. */
async function resolveChain(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
}

async function readyBoard(p1Points: number): Promise<Game> {
  const game = await board(p1Points).build();
  await grantGanking(game);
  return game;
}

describe("Lucian, Merciless × Bounty Hunter — two conquers in one turn around Victory−1", () => {
  // ── (a) from 3 points ───────────────────────────────────────────────────────────────────────

  test("(a) the Standard Move to the empty bf1 exhausts Lucian and opens a non-combat showdown with P1 holding Focus (144.2)", async () => {
    const game = await readyBoard(3);
    await game.p1.move("lucian", "bf1");
    expect(game.zoneOf("lucian")).toBe("battlefield-bf1");
    expect(game.state("lucian").isExhausted).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.points()).toBe(3);
  });

  test("(a) pass/pass at bf1: P1 conquers (3 → 4) and Lucian's 'first time I conquer each turn' is the lone item on the chain — a triggered P1 item, no order prompt (469.1, 383.4.c.2.a, 471.2.a)", async () => {
    const game = await readyBoard(3);
    await game.p1.move("lucian", "bf1");
    await passPass(game, "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(4);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["bf1"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lucian", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("lucian").isExhausted).toBe(true); // not yet — the item has to resolve
  });

  test("(a) the trigger resolves → Lucian is READY at bf1, and with [Ganking] a bf1 → bf2 gank is now a legal action", async () => {
    const game = await readyBoard(3);
    await game.p1.move("lucian", "bf1");
    await passPass(game, "bf1");
    await resolveChain(game);
    expect(game.state("lucian")).toMatchObject({ isReady: true, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("gank", "lucian")).toBe(true);
  });

  test("(a) gank to bf2 (exhausts), pass/pass → conquer (4 → 5); this SECOND conquer puts nothing on the chain and Lucian stays EXHAUSTED at bf2 (383.1)", async () => {
    const game = await readyBoard(3);
    await game.p1.move("lucian", "bf1");
    await passPass(game, "bf1");
    await resolveChain(game);
    await game.p1.gank("lucian", "bf2");
    expect(game.state("lucian")).toMatchObject({ isExhausted: true, zone: "battlefield-bf2" });
    await passPass(game, "bf2");
    expect(game.p1.points()).toBe(5);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("lucian")).toMatchObject({ isExhausted: true, zone: "battlefield-bf2" });
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("(a) the vacated bf1 lapses to Uncontrolled at the next Open cleanup (323.6) yet remains 'scored this turn' alongside bf2 (470)", async () => {
    const game = await readyBoard(3);
    await game.p1.move("lucian", "bf1");
    await passPass(game, "bf1");
    await resolveChain(game);
    await game.p1.gank("lucian", "bf2");
    await passPass(game, "bf2");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.gameState.scoredThisTurn?.[P1]?.slice().sort()).toEqual(["bf1", "bf2"]);
  });

  // ── (b) from 7 points ───────────────────────────────────────────────────────────────────────

  test("(b) at 7 the bf1 conquer yields a CARD, not a point: P1 draws 1 and stays at 7; bf1 still counts as conquered/scored this turn (471.1.b.1, 470)", async () => {
    const game = await readyBoard(7);
    const hand0 = game.p1.hand().length;
    await game.p1.move("lucian", "bf1");
    await passPass(game, "bf1");
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["bf1"]);
    expect(game.gameState.conqueredThisTurn?.[P1]).toEqual(["bf1"]);
    expect(game.isOver()).toBe(false);
  });

  test("(b) the Conquer happened even though its point was replaced, so Lucian's trigger STILL goes on the chain and readies him (383.4.c.2.c)", async () => {
    const game = await readyBoard(7);
    await game.p1.move("lucian", "bf1");
    await passPass(game, "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lucian", controller: P1, triggered: true })]);
    await resolveChain(game);
    expect(game.state("lucian")).toMatchObject({ isReady: true, zone: "battlefield-bf1" });
    expect(game.p1.can("gank", "lucian")).toBe(true);
    expect(game.p1.points()).toBe(7);
  });

  test("(b) gank on to bf2, pass/pass: every battlefield is now scored this turn → the Final Point → 8 and P1 WINS; net +1 card, 7 → 7 → 8 (471.1.b, 323.1, 472)", async () => {
    const game = await readyBoard(7);
    const hand0 = game.p1.hand().length;
    await game.p1.move("lucian", "bf1");
    await passPass(game, "bf1");
    await resolveChain(game);
    await game.p1.gank("lucian", "bf2");
    expect(game.isOver()).toBe(false);
    expect(game.p1.points()).toBe(7);
    await passPass(game, "bf2");
    expect(game.gameState.scoredThisTurn?.[P1]?.slice().sort()).toEqual(["bf1", "bf2"]);
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    // The second conquer's would-be trigger is moot: game over, nothing left pending for anyone.
    expect(game.decision()).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  // ── (c) from 6 points ───────────────────────────────────────────────────────────────────────

  test("(c) at 6 the bf1 conquer is unrestricted (6 < Victory−1): 6 → 7 with NO draw, Lucian readied by his trigger", async () => {
    const game = await readyBoard(6);
    const hand0 = game.p1.hand().length;
    await game.p1.move("lucian", "bf1");
    await passPass(game, "bf1");
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand0);
    await resolveChain(game);
    expect(game.state("lucian").isReady).toBe(true);
  });

  test("(c) then bf2 at 7 with every battlefield scored → Final Point → 8, P1 wins", async () => {
    const game = await readyBoard(6);
    await game.p1.move("lucian", "bf1");
    await passPass(game, "bf1");
    await resolveChain(game);
    await game.p1.gank("lucian", "bf2");
    await passPass(game, "bf2");
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  // ── (d) "each turn" resets ──────────────────────────────────────────────────────────────────

  test("(d) 'each turn' memory resets: next P1 turn (Ganking re-granted) his FIRST conquer — bf2 → the lapsed bf1 — triggers again and readies him", async () => {
    const game = await readyBoard(3);
    await game.p1.move("lucian", "bf1");
    await passPass(game, "bf1");
    await resolveChain(game);
    await game.p1.gank("lucian", "bf2");
    await passPass(game, "bf2");
    expect(game.state("lucian").isExhausted).toBe(true); // second conquer this turn did not ready him
    expect(game.p1.points()).toBe(5);

    await game.advanceTurn(); // → P2's turn 4
    expect(game.turnPlayer()).toBe(P2);
    await game.advanceTurn(); // → P1's turn 5: awakens (Lucian + legend ready) and HOLDS bf2 → 6
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(5);
    expect(game.p1.points()).toBe(6);
    expect(game.state("lucian")).toMatchObject({ isReady: true, zone: "battlefield-bf2" });
    expect(game.state("lucian").grantedKeywords).toEqual([]); // last turn's Ganking expired
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["bf2"]); // the Hold

    await grantGanking(game);
    await game.p1.gank("lucian", "bf1");
    expect(game.state("lucian").isExhausted).toBe(true);
    await passPass(game, "bf1");
    expect(game.p1.points()).toBe(7); // 6 → 7: a conquer below Victory−1, unrestricted
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lucian", controller: P1, triggered: true })]);
    await resolveChain(game);
    expect(game.state("lucian")).toMatchObject({ isReady: true, zone: "battlefield-bf1" });
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
