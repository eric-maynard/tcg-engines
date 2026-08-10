/**
 * Interaction: Hold on your own turn, then get Charmed around and CONQUER the same battlefield on the opponent's
 * turn — with and without a detour through the second battlefield that turns it into the Final Point.
 *   × Charm (ogn-043-298) · Spell · Calm · 1+[calm] · Action — "Move an enemy unit."                — P1, two copies
 *   × Dunebreaker (sfd-027-221) · Unit · Fury · 7 · 7 Might — "If you have two or fewer cards in your hand, I enter
 *     ready. When I hold, draw 2."                                                                     — P2, alone at A
 *   × an inline vanilla 2-Might unit "V"                                                              — P1, in base
 *
 * Rules: 315.2.b.2 (Scoring Step: Turn Player Holds what they control), 469.2 / 469.1 (Hold / Conquer), 470 (once
 * per battlefield PER TURN — bookkeeping resets every turn for every player), 471.1.b / 471.1.b.1 (at Victory−1 a
 * Conquer only gives the Final Point if the player scored EVERY battlefield this turn, else draw 1), 471.1.a.1
 * (Hold points are not restricted), 471.2.b (Hold abilities trigger), 472 (win check at Cleanup), 449 (effect
 * move), 323.6 (emptied battlefield → uncontrolled), 190.3.a.1 (arriving unit's controller applies Contested),
 * 345 (contesting player has Focus), 348.2.a.1 (non-combat showdown → Conquer), 323.9 / 464.2.c (Combat; Attacker
 * = whoever applied Contested, even on the other player's turn), 466.3.a / 466.5.d / 466.5.e (combat winner
 * establishes control → Conquer if not yet scored there this turn).
 *
 * Position: 1v1, Victory 8. P2 on 5 starts ITS turn controlling A with a lone Dunebreaker; B empty/uncontrolled.
 * P2 Holds A, does nothing else, ends turn. P1's turn: two Charms, V (2 Might) in base, calm runes for everything.
 *   DETOUR: Charm Dunebreaker A→B (pass/pass at B); Standard-Move V → the now-empty A (pass/pass); Charm
 *           Dunebreaker B→A; combat resolves.
 *   DIRECT: identical, except Charm#1 sends Dunebreaker A→P2's BASE and Charm#2 sends it base→A.
 *
 * Expected: (a) P2's Scoring Step: (P2, A, hold, +1) 5→6, Dunebreaker draws 2; scoredThisTurn[P2]=[A] for P2's
 * turn only — it is empty again when P1's turn starts. (b) DETOUR: Charm#1 → A uncontrolled, B contested by P2 →
 * non-combat showdown with P2 holding Focus on P1's turn → (P2, B, conquer, +1) 6→7. V → A: (P1, A, conquer, +1).
 * Charm#2 → combat at A, P2 Attacker, 7 vs 2 → V dies → P2 establishes control; P2 has NOT scored A this turn (the
 * Hold was last turn) → Conquer at Victory−1 with scoredThisTurn[P2]=[B, A] = every battlefield → Final Point 7→8
 * → P2 WINS during P1's turn. (c) DIRECT: Charm#1 to base stages nothing; (P1, A, conquer, +1); Charm#2 → combat →
 * (P2, A, conquer, +1) 6→7 — 6 is not Victory−1, plain point, no win. [Had P2 started its turn on 6 (Hold → 7),
 * DIRECT gives 471.1.b.1 "draw 1 instead": P2 stays 7, keeps A, and wins by Hold in its next Scoring Step.]
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const DUNEBREAKER = "sfd-027-221";

/**
 * Turn 2, P1 active (so that advancing once runs P2's Beginning Phase with the Hold). Victory 8, P2 on `p2Points`.
 * A: controlled by P2 with Dunebreaker on it. B: uncontrolled, empty. P1: V (2 Might) in base, 6 ready calm runes,
 * two Charms in hand. Decks auto-filled.
 */
function board(p2Points = 5) {
  return scenario()
    .turn(2)
    .active(P1)
    .victoryScore(8)
    .points(P1, 0)
    .points(P2, p2Points)
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfB", { controller: null })
    .unit(P2, "bfA", DUNEBREAKER, "dune")
    .unit(P1, "base", { might: 2, name: "Vanilla V" }, "vee")
    .runes(P1, "calm", 6)
    .hand(P1, CHARM, "charm1")
    .hand(P1, CHARM, "charm2");
}

const bf = (game: Game, id: string) => game.gameState.battlefields[id];
const scored = (game: Game, seat: string) => [...(game.gameState.scoredThisTurn?.[seat] ?? [])];

/** P1 ends turn 2 → P2's turn 3 (Hold A happens in its Scoring Step) → P2 ends → P1's turn 4, open main phase. */
async function toP1Turn(p2Points = 5): Promise<Game> {
  const game = await board(p2Points).build();
  await game.advanceTurn(); // → P2's main phase
  expect(game.turnPlayer()).toBe(P2);
  await game.advanceTurn(); // P2 does nothing → P1's main phase
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
  return game;
}

/** Pay 1 + [calm] from runes, cast a Charm on Dunebreaker, name the destination (asked as it is played), pass/pass. */
async function charmDuneTo(game: Game, charm: "charm1" | "charm2", destination: "base" | "battlefield-bfA" | "battlefield-bfB"): Promise<void> {
  await game.p1.tapRune();
  await game.p1.recycleRune();
  await game.p1.cast(charm, { targets: "dune" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { pendingChoiceType: "choose-destination" } });
  await game.p1.pick(destination);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf(charm)).toBe("trash");
}

/** A Cleanup-begun showdown is handed back once by settle(); settling again passes Focus for both → it ends. */
async function passShowdown(game: Game): Promise<void> {
  const first = await game.settle();
  if (first.reason === "open" && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "showdown") {
    await game.settle();
  }
}

describe("Held A on own turn × Charm detour through B × Final Point on the opponent's turn", () => {
  // ── (a) P2's own turn: the Hold ─────────────────────────────────────────────────────────────

  test("(a) 315.2.b.2 / 469.2 / 471.2.b: P2's Scoring Step Holds A → P2 5→6 and Dunebreaker's 'When I hold, draw 2' fires (hand +3 with the Draw Step); scoredThisTurn[P2] = [A] during P2's turn", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(6);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1 + 2); // draw step + Dunebreaker
    expect(scored(game, P2)).toEqual(["bfA"]);
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P2 });
    expect(game.locationOf("dune")).toBe("bfA");
    expect(game.isOver()).toBe(false);
  });

  test("(a→b) 470 is per TURN, for every player: when P1's turn starts P2's score bookkeeping is empty again although A never changed hands", async () => {
    const game = await toP1Turn();
    expect(scored(game, P2)).toEqual([]);
    expect(scored(game, P1)).toEqual([]);
    expect(bf(game, "bfA")?.controller).toBe(P2);
    expect(bf(game, "bfB")?.controller).toBeNull();
    expect(game.p2.points()).toBe(6);
  });

  // ── (b) DETOUR line ─────────────────────────────────────────────────────────────────────────

  test("(b) Charm#1 offers base and B as destinations (not A, where Dunebreaker stands); A→B: A goes UNCONTROLLED (323.6), B is Contested by P2 (190.3.a.1) and a NON-combat showdown begins with P2 holding Focus on P1's turn (345)", async () => {
    const game = await toP1Turn();
    await game.p1.tapRune();
    await game.p1.recycleRune();
    await game.p1.cast("charm1", { targets: "dune" });
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["base", "battlefield-bfB"]);
    await game.p1.pick("battlefield-bfB");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("dune")).toBe("bfB");
    expect(game.state("dune").isExhausted).toBe(false); // effect move, not a Standard Move
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: null });
    expect(bf(game, "bfB")).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bfB", focusPlayer: P2, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p2.points()).toBe(6); // nothing scored yet
  });

  test("(b) both pass at B → 348.2.a.1: P2 has not scored B this turn → (P2, B, conquer, +1) 6→7 on P1's turn — a plain point (6 is not Victory−1), no card drawn, no win; scoredThisTurn[P2] = [B]", async () => {
    const game = await toP1Turn();
    const p2Hand = game.p2.hand().length;
    await charmDuneTo(game, "charm1", "battlefield-bfB");
    await passShowdown(game);
    expect(game.p2.points()).toBe(7);
    expect(game.p2.hand()).toHaveLength(p2Hand); // Dunebreaker has no conquer ability; no 471.1.b.1 draw
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: P2 });
    expect(scored(game, P2)).toEqual(["bfB"]);
    expect(game.isOver()).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(b) V Standard-Moves to the now-empty A: showdown (P1 Focus), pass/pass → (P1, A, conquer, +1) 0→1; A controlled by P1", async () => {
    const game = await toP1Turn();
    await charmDuneTo(game, "charm1", "battlefield-bfB");
    await passShowdown(game);
    await game.p1.move("vee", "bfA");
    expect(bf(game, "bfA")).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await passShowdown(game);
    expect(game.p1.points()).toBe(1);
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P1 });
    expect(scored(game, P1)).toEqual(["bfA"]);
    expect(game.state("vee").isExhausted).toBe(true);
  });

  test("(b) Charm#2 B→A: B goes uncontrolled; A is Contested by P2 → COMBAT with P2 as Attacker and V as Defender on P1's turn (464.2.c), P2 holds Focus", async () => {
    const game = await toP1Turn();
    await charmDuneTo(game, "charm1", "battlefield-bfB");
    await passShowdown(game);
    await game.p1.move("vee", "bfA");
    await passShowdown(game);
    await charmDuneTo(game, "charm2", "battlefield-bfA");
    expect(game.locationOf("dune")).toBe("bfA");
    expect(bf(game, "bfB")?.controller).toBeNull();
    expect(bf(game, "bfA")).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({
      active: true,
      attackingPlayer: P2,
      battlefieldId: "bfA",
      defendingPlayer: P1,
      focusPlayer: P2,
      isCombatShowdown: true,
    });
    expect(game.state("dune").combatRole).toBe("attacker");
    expect(game.state("vee").combatRole).toBe("defender");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p2.points()).toBe(7);
  });

  test("(b) combat resolves: 7 vs 2 → V dies; P2 establishes control of A = CONQUER although P2 Held A on its own turn (470 resets per turn); P2 is on 7 = Victory−1 and has now scored [B, A] = every battlefield → 471.1.b.1 FINAL POINT 7→8 → 472: P2 WINS during P1's turn", async () => {
    const game = await toP1Turn();
    await charmDuneTo(game, "charm1", "battlefield-bfB");
    await passShowdown(game);
    await game.p1.move("vee", "bfA");
    await passShowdown(game);
    await charmDuneTo(game, "charm2", "battlefield-bfA");
    const p2Hand = game.p2.hand().length;
    const r = await game.settle(); // both pass Focus, combat damage, Cleanup
    expect(game.zoneOf("vee")).toBe("trash");
    expect(game.locationOf("dune")).toBe("bfA");
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P2 });
    expect(scored(game, P2)).toEqual(["bfB", "bfA"]);
    expect(game.p2.points()).toBe(8);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.hand()).toHaveLength(p2Hand); // a POINT, not the 471.1.b.1 draw
    expect(r.reason).toBe("game-over");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.turnPlayer()).toBe(P1); // it happened on P1's turn
    expect(game.violations()).toEqual([]);
  });

  // ── (c) DIRECT line ─────────────────────────────────────────────────────────────────────────

  test("(c) DIRECT Charm#1 A→P2's base: a legal destination; nothing is staged (no showdown, no chain), A simply becomes uncontrolled and nobody scores", async () => {
    const game = await toP1Turn();
    await charmDuneTo(game, "charm1", "base");
    expect(game.locationOf("dune")).toBe("base");
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: null });
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: null });
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.points()).toBe(6);
    expect(scored(game, P2)).toEqual([]);
  });

  test("(c) DIRECT full line: (P1, A, conquer, +1); Charm#2 base→A → combat, P2 wins it → (P2, A, conquer, +1) 6→7 — 6 is not Victory−1 so it is a plain point, no draw, NO win; scoredThisTurn[P2] = [A]; still P1's turn", async () => {
    const game = await toP1Turn();
    await charmDuneTo(game, "charm1", "base");
    await game.settle();
    await game.p1.move("vee", "bfA");
    await passShowdown(game);
    expect(game.p1.points()).toBe(1);
    await game.p1.tapRune();
    await game.p1.recycleRune();
    await game.p1.cast("charm2", { targets: "dune" });
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["battlefield-bfA", "battlefield-bfB"]);
    await game.p1.pick("battlefield-bfA");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bfA", isCombatShowdown: true });
    const p2Hand = game.p2.hand().length;
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("vee")).toBe("trash");
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(7);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(scored(game, P2)).toEqual(["bfA"]);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) key contrast: same final combat at A, same 'P2 Held A last turn' — DETOUR ends the game 8-1 for P2, DIRECT leaves it 7-1 and running; the B point is what makes A the Final Point", async () => {
    const detour = await toP1Turn();
    await charmDuneTo(detour, "charm1", "battlefield-bfB");
    await passShowdown(detour);
    await detour.p1.move("vee", "bfA");
    await passShowdown(detour);
    await charmDuneTo(detour, "charm2", "battlefield-bfA");
    await detour.settle();

    const direct = await toP1Turn();
    await charmDuneTo(direct, "charm1", "base");
    await direct.settle();
    await direct.p1.move("vee", "bfA");
    await passShowdown(direct);
    await charmDuneTo(direct, "charm2", "battlefield-bfA");
    await direct.settle();

    expect([detour.p2.points(), detour.p1.points(), detour.isOver(), detour.winner()]).toEqual([8, 1, true, P2]);
    expect([direct.p2.points(), direct.p1.points(), direct.isOver(), direct.winner()]).toEqual([7, 1, false, undefined]);
  });

  // ── [bracket] DIRECT from 6: the 471.1.b.1 draw-instead, then win by Hold ─────────────────

  test("[variant] P2 starts its turn on 6 instead: Hold → 7; DIRECT line → P2 conquers A at Victory−1 having scored ONLY A this turn → 471.1.b.1: draws 1 INSTEAD of the point (stays 7, keeps A, no win) …", async () => {
    const game = await toP1Turn(6);
    expect(game.p2.points()).toBe(7);
    await charmDuneTo(game, "charm1", "base");
    await game.settle();
    await game.p1.move("vee", "bfA");
    await passShowdown(game);
    await charmDuneTo(game, "charm2", "battlefield-bfA");
    const p2Hand = game.p2.hand().length;
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("vee")).toBe("trash");
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(7);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(scored(game, P2)).toEqual(["bfA"]);
    expect(game.isOver()).toBe(false);
  });

  test("[variant] … and then wins 8-1 by (P2, A, hold, +1) in its NEXT Scoring Step — Hold points are not subject to the Final Point restriction (471.1.a.1)", async () => {
    const game = await toP1Turn(6);
    await charmDuneTo(game, "charm1", "base");
    await game.settle();
    await game.p1.move("vee", "bfA");
    await passShowdown(game);
    await charmDuneTo(game, "charm2", "battlefield-bfA");
    await game.settle();
    expect(game.p2.points()).toBe(7);
    await game.p1.endTurn();
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
