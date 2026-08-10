/**
 * Interaction: Call to Battle (unl-101-219) · Spell · Body · 3
 *     "Move a unit you control to a battlefield you control. Then, choose an opponent. They move a
 *      unit they control to the same battlefield."
 *   × Kai'Sa, Survivor (ogn-039-298) · Unit · 4 Might · "[Accelerate] … When I conquer, draw 1."
 *   × Plundering Poro (sfd-069-221) · Unit · 2 Might · "When I conquer, play a Gold gear token exhausted."
 *
 * Question (1v1, Victory Score 8, battlefields A and B): P1 controls A with Plundering Poro. P2's only
 * unit is a ready Kai'Sa in base. On P1's turn P1 casts Call to Battle: a 1-Might P1 unit goes base → A,
 * then P2 must move a unit to A — Kai'Sa.
 *   (a) Who attacks / defends, and does a combat really begin on P1's turn?
 *   (b) Kai'Sa (4) kills both defenders (2+1) and survives 3: does P2 conquer A and score during P1's
 *       turn, and does Kai'Sa's conquer trigger fire?
 *   (c) P2 at 7: does this conquer win the game? If not, what does P2 get, and what happens at the
 *       Scoring Step of P2's next turn if P1 fails to retake A?
 *   (d) Contrast: P2 at 6.
 *
 * Rules:
 *   446/449            — both moves are effect moves; P2's is mandatory if a unit can legally move.
 *   190.3.a / .a.1     — Kai'Sa (controller doesn't control A) became present → P2 applied Contested.
 *   323.9 / 323.13     — cleanup after the spell: combat staged & begins in Neutral Open on P1's turn.
 *   464.2.c            — the player who applied Contested attacks → P2 attacks, P1 defends; P2 has Focus.
 *   466.1.a.1/.a.2     — survivors healed; attackers recalled only if defenders remain.
 *   466.3.a / 466.5(.d)— sole player with units wins, establishes control → Conquer (469.1 asks only
 *                        whether P2 scored A THIS turn — not whose turn it is) → 1 point; 471.2.a triggers.
 *   471.1.b / .b.1     — at Victory−1 a Conquer point needs every battlefield scored this turn, else draw 1.
 *   315.2.b.2 / 469.2 / 471.1.a.1 — Hold in P2's own Beginning Phase is not a Conquer → no restriction.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CALL_TO_BATTLE = "unl-101-219";
const KAISA = "ogn-039-298";
const PLUNDERING_PORO = "sfd-069-221";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn 2, Victory Score 8. P1 controls A (Plundering Poro there) and nothing else; B is uncontrolled.
 * P1: Recruit (1) ready in base, Avenger (4) ready in base (for the "retake A" line), 3 energy, Call to Battle.
 * P2: ready Kai'Sa in base — P2's only unit.
 */
function board(p2Points = 0) {
  return scenario()
    .victoryScore(8)
    .points(P2, p2Points)
    .resources(P1, { energy: 3 })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: null })
    .unit(P1, "bfA", PLUNDERING_PORO, "poro")
    .unit(P1, "base", { might: 1, name: "Recruit" }, "recruit")
    .unit(P1, "base", { might: 4, name: "Avenger" }, "avenger")
    .unit(P2, "base", KAISA, "kaisa")
    .hand(P1, CALL_TO_BATTLE, "ctb");
}

/**
 * Cast Call to Battle on Recruit (its only controlled destination is A → no destination prompt), let it
 * resolve, and answer P2's forced "which unit" choice if the engine asks it. Stops at the first
 * decision that is neither chain priority nor that pick — i.e. the combat showdown.
 */
async function callKaisaToA(game: Game): Promise<void> {
  await game.p1.cast("ctb", { targets: "recruit" });
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d) {
      return;
    }
    if (d.kind === "action" && d.context === "chain" && d.passKey) {
      await game.seat(d.seat).pass();
      continue;
    }
    if (d.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === "kaisa")) {
      expect(d.seat).toBe(P2); // "THEY move a unit they control" — the opponent chooses
      await game.p2.pick("kaisa");
      continue;
    }
    return;
  }
}

describe("Call to Battle drags Kai'Sa into a conquer on the caster's turn", () => {
  // ── (a) a real combat on P1's turn, with P2 attacking ───────────────────────────────────────

  test("(a) the spell resolves fully: Recruit and Kai'Sa are both at A, the spell is in the trash, A is Contested BY P2, and it is still P1's turn", async () => {
    const game = await board().build();
    await callKaisaToA(game);
    expect(game.zoneOf("ctb")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(game.locationOf("recruit")).toBe("bfA");
    expect(game.locationOf("kaisa")).toBe("bfA");
    expect(game.locationOf("poro")).toBe("bfA");
    expect(game.state("kaisa").isReady).toBe(true); // an effect move exhausts nothing
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]);
  });

  test("(a) a Combat begins in the cleanup (323.9/323.13): combat showdown at A with P2 = Attacker holding Focus and P1 = Defender, even though it is P1's turn (464.2.c)", async () => {
    const game = await board().build();
    await callKaisaToA(game);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({
      active: true,
      attackingPlayer: P2,
      battlefieldId: "bfA",
      defendingPlayer: P1,
      focusPlayer: P2,
      isCombatShowdown: true,
    });
    expect(game.state("kaisa").combatRole).toBe("attacker");
    expect(game.state("poro").combatRole).toBe("defender");
    expect(game.state("recruit").combatRole).toBe("defender");
    expect(game.state("avenger").combatRole ?? null).toBeNull(); // in base, not in this combat
    expect(game.turnPlayer()).toBe(P1);
  });

  // ── (b) P2 conquers and scores during P1's turn; Kai'Sa's trigger fires ────────────────────

  test("(b) combat: Kai'Sa splits 4 lethally over Poro (2) and Recruit (1), takes 3 and survives healed, is NOT recalled; P2 conquers A for 1 point on P1's turn and Kai'Sa's 'When I conquer, draw 1' fires", async () => {
    const game = await board().build();
    const p2Hand0 = game.p2.hand().length;
    const p1Hand0 = game.p1.hand().length; // ctb still in hand here
    await callKaisaToA(game);
    const s = await game.settle(); // both pass focus → damage (default lethal split) → cleanup → trigger resolves
    expect(s.reason).toBe("open");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("recruit")).toBe("trash");
    expect(game.zoneOf("kaisa")).toBe("battlefield-bfA"); // 466.1.a.2: no defenders left → stays
    expect(game.state("kaisa").damage).toBe(0); // 466.1.a.1
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 1); // Kai'Sa's conquer draw
    expect(game.p1.hand()).toHaveLength(p1Hand0 - 1); // only the spell left P1's hand
    // Plundering Poro died defending — it conquered nothing, so no Gold token exists anywhere.
    expect(game.p1.gear()).toEqual([]);
    expect(game.findAll({ name: /gold/i })).toEqual([]);
    // Back to P1's own Neutral Open main phase.
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) P2 at 7: no win now (draw instead), but Hold wins next turn unless P1 answers ────────

  test("(c) P2 at 7: the Conquer at Victory−1 without having scored every battlefield this turn yields a CARD, not the point (471.1.b.1) — P2 stays at 7, draws 2 in total (that + Kai'Sa), and the game is NOT over; A is nonetheless P2's", async () => {
    const game = await board(7).build();
    const p2Hand0 = game.p2.hand().length;
    await callKaisaToA(game);
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.p2.points()).toBe(7);
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 2);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("kaisa")).toBe("battlefield-bfA");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(c) …if P1 just ends the turn, P2 HOLDS A at the Scoring Step of P2's Beginning Phase — Hold ignores the Final-Point restriction (471.1.a.1) → 8 → P2 wins", async () => {
    const game = await board(7).build();
    await callKaisaToA(game);
    await game.settle();
    expect(game.p2.points()).toBe(7);
    await game.p1.endTurn();
    await game.settle();
    expect(game.p2.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
  });

  test("(c) …but P1 still has the rest of the turn: Avenger (4) moves into A, trades with Kai'Sa (4), A is left with no units → uncontrolled (466.5.b); P2 holds nothing next turn and stays at 7", async () => {
    const game = await board(7).build();
    await callKaisaToA(game);
    await game.settle();
    expect(game.p1.can("move")).toBe(true);
    await game.p1.move("avenger", "bfA");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // now P1 attacks
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("avenger")).toBe("trash");
    expect(game.zoneOf("kaisa")).toBe("trash");
    expect(game.gameState.battlefields.bfA?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0); // nobody left → nobody conquers
    expect(game.p2.points()).toBe(7);
    await game.advanceTurn(); // → P2's turn; Scoring Step finds nothing to Hold
    expect(game.turnPlayer()).toBe(P2);
    expect(game.isOver()).toBe(false);
    expect(game.p2.points()).toBe(7);
  });

  // ── (d) P2 at 6: ordinary point now, same Hold-to-win threat ───────────────────────────────

  test("(d) P2 at 6: the restriction is not engaged (attempt made at 6) → conquer scores normally to 7, Kai'Sa draws exactly 1; game continues on P1's turn", async () => {
    const game = await board(6).build();
    const p2Hand0 = game.p2.hand().length;
    await callKaisaToA(game);
    await game.settle();
    expect(game.p2.points()).toBe(7);
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 1);
    expect(game.isOver()).toBe(false);
    expect(game.gameState.battlefields.bfA?.controller).toBe(P2);
    expect(game.turnPlayer()).toBe(P1);
  });

  test("(d) P2 at 6 → 7, then unanswered: Hold at P2's next Scoring Step gives the 8th point and the win", async () => {
    const game = await board(6).build();
    await callKaisaToA(game);
    await game.settle();
    expect(game.p2.points()).toBe(7);
    await game.p1.endTurn();
    await game.settle();
    expect(game.p2.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
  });
});
