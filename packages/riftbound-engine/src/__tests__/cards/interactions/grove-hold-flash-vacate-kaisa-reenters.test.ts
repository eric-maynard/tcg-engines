/**
 * Interaction: Grove of the God-Willow (ogn-280-298) · Battlefield — "When you hold here, draw 1."
 *   × Flash (ogs-011-024) · Spell · Chaos · 2 · Reaction — "Move up to 2 friendly units to base."
 *   × Kai'Sa, Survivor (ogn-039-298) · Champion Unit · Fury · 4 · 4 Might
 *     "[Accelerate] … When I conquer, draw 1."
 *
 * Rules: 315.2.b.2 / 469.2 (Beginning Phase: the turn player Holds each battlefield they control = a
 * Score), 471.2.b (hold abilities trigger at the held battlefield), 470 (a player may Score a given
 * battlefield only ONCE per turn, from either method), 348.2.a / 348.2.a.1 (end of a showdown: the lone
 * remaining side establishes control — a Conquer only if they have not scored there this turn), 471.2.c
 * (score abilities only trigger when the battlefield is Scored), 449 (Flash's relocation is a Move),
 * 323.6 / 190.4.c (a controlled battlefield with none of the controller's units becomes uncontrolled at
 * the next Open cleanup), 190.3.a.1 (arriving at a battlefield you don't control applies Contested →
 * non-combat showdown), 383.4.c.2.a ("When I conquer" needs an actual Conquer).
 *
 * Question (1v1, Victory 8, P1 on 3): P1's turn begins controlling A = Grove with a lone 2-Might Holder;
 * B uncontrolled; Kai'Sa ready in base; Flash in hand.
 *   (a) Scoring Step? (b) Flash Holder home — does P1 lose A? (c) Kai'Sa Standard-Moves into A, all
 *   pass: control regained? Conquer / point / Kai'Sa draw / Grove / score event? (d) contrast: Kai'Sa
 *   to B instead. (e) next P1 turn with Kai'Sa alone at A: Hold again?
 *
 * Expected: (a) (P1, A, hold, +1): 3→4; Grove draws 1; scoredThisTurn[P1]=[A]. (b) A → uncontrolled; the
 * point stays. (c) P1 re-establishes control of A but has ALREADY scored A this turn → not a Conquer: no
 * point (stays 4), no Kai'Sa draw, no Grove draw, scoredThisTurn still [A], conqueredThisTurn []. (d) B:
 * Conquer → 5, conqueredThisTurn [B], Kai'Sa draws 1. (e) fresh turn record → A Holds again: +1 and Grove
 * draws again.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GROVE = "ogn-280-298";
const FLASH = "ogs-011-024";
const KAISA = "ogn-039-298";

/** P2 about to end turn 2. P1 (3 pts) controls A = live Grove via a lone Holder; B open; Kai'Sa ready in P1's base; Flash in hand. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .victoryScore(8)
    .points(P1, 3)
    .points(P2, 0)
    .battlefield("A", { controller: P1, def: GROVE, inert: false, owner: P1 })
    .battlefield("B", { controller: null })
    .unit(P1, "A", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", KAISA, "kaisa")
    .unit(P2, "base", { might: 1, name: "P2 Homebody" }, "p2home")
    .hand(P1, FLASH, "flash");
}

const bf = (game: Game, id: string) => game.gameState.battlefields[id];
const showdowns = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);

/** (a) P2 ends → P1's turn has begun and settled into P1's open Main Phase (hold scored, Grove draw resolved). */
async function p1Main(): Promise<{ game: Game; hand0: number }> {
  const game = await board().build();
  const hand0 = game.p1.hand().length; // = 1 (Flash)
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
  await game.p1.do("addResources", { energy: 2 }); // Flash's cost (pools were emptied at end of turn)
  return { game, hand0 };
}

/** (b) …then P1 Flashes the Holder home and it resolves. */
async function flashedOut(): Promise<{ game: Game; hand0: number }> {
  const r = await p1Main();
  await r.game.p1.cast("flash", { targets: "holder" });
  await r.game.settle();
  expect(r.game.zoneOf("flash")).toBe("trash");
  expect(r.game.zoneOf("holder")).toBe("base");
  return r;
}

/** (c)/(d) …then Kai'Sa Standard-Moves to `dest` and everyone passes until P1's open Main Phase again. */
async function kaisaInto(dest: "A" | "B"): Promise<{ game: Game; hand0: number; handBeforeMove: number }> {
  const r = await flashedOut();
  const handBeforeMove = r.game.p1.hand().length;
  await r.game.p1.move("kaisa", dest);
  for (let i = 0; i < 4; i++) {
    const s = await r.game.settle();
    const d = r.game.decision();
    if (s.reason === "open" && d?.kind === "action" && d.context === "main") {
      break;
    }
  }
  expect(r.game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return { ...r, handBeforeMove };
}

describe("Grove hold, Flash vacates, Kai'Sa re-enters the same turn — 470 'once per battlefield per turn'", () => {
  // ── (a) Scoring Step ─────────────────────────────────────────────────────────────────────────

  test("(a) Beginning Phase: P1 Holds A → (P1, A, hold, +1): 3 → 4, scoredThisTurn[P1] = [A], not a conquer; Grove's hold trigger is a P1 item at A (315.2.b.2, 469.2, 471.2.b)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(4);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.gameState.conqueredThisTurn[P1]).toEqual([]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "A", controller: P1, triggered: true })]);
  });

  test("(a) …and once it resolves P1 has drawn 1 off the Grove (plus the normal Draw Step card)", async () => {
    const { game, hand0 } = await p1Main();
    expect(game.p1.hand()).toHaveLength(hand0 + 1 + 1); // draw step + Grove
    expect(game.p1.points()).toBe(4);
    expect(bf(game, "A")?.controller).toBe(P1);
    expect(game.chain()).toEqual([]);
  });

  // ── (b) Flash the Holder home ────────────────────────────────────────────────────────────────

  test("(b) Flash (a Reaction) is legal in P1's own Main Phase and offers both friendly units; Holder → base for 2 energy (449)", async () => {
    const { game } = await p1Main();
    expect(game.p1.can("cast", "flash")).toBe(true);
    const offered = (game.p1.option("cast", "flash")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(expect.arrayContaining(["holder", "kaisa"]));
    expect(offered).not.toContain("p2home");
    await game.p1.cast("flash", { targets: "holder" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("holder")).toBe("base");
    expect(game.p1.base()).toContain("holder");
  });

  test("(b) A now has no units → P1 LOSES control at the Open cleanup (323.6 / 190.4.c); the point already scored stays (4), scoredThisTurn unchanged", async () => {
    const { game } = await flashedOut();
    expect(game.cardsAt("A")).toEqual([]);
    expect(bf(game, "A")?.controller ?? null).toBeNull();
    expect(bf(game, "A")?.contested).toBe(false);
    expect(game.p1.points()).toBe(4);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (c) Kai'Sa re-enters A ───────────────────────────────────────────────────────────────────

  test("(c) Kai'Sa base → uncontrolled A applies Contested and opens a NON-combat showdown with P1 holding Focus (190.3.a.1, 344.2)", async () => {
    const { game } = await flashedOut();
    await game.p1.move("kaisa", "A");
    expect(game.state("kaisa")).toMatchObject({ isExhausted: true, zone: "battlefield-A" });
    expect(game.chain()).toEqual([]); // Kai'Sa has no move trigger
    expect(showdowns(game)).toHaveLength(1);
    expect(showdowns(game)[0]).toMatchObject({ battlefieldId: "A", focusPlayer: P1, isCombatShowdown: false });
    expect(bf(game, "A")).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("(c) pass/pass: P1 re-establishes CONTROL of A (348.2.a)", async () => {
    const { game } = await kaisaInto("A");
    expect(showdowns(game)).toEqual([]);
    expect(bf(game, "A")).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.units("A")).toEqual(["kaisa"]);
  });

  test("(c) …but P1 already scored A this turn (by Hold — 470 'from either method') → NO point: P1 stays on 4, scoredThisTurn[P1] still exactly [A] (348.2.a.1, 470)", async () => {
    const { game } = await kaisaInto("A");
    expect(game.p1.points()).toBe(4);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
  });

  test("(c) …it is not a Conquer at all, so conqueredThisTurn[P1] must stay empty — the engine records A as conquered anyway (348.2.a.1)", async () => {
    // Expected: 348.2.a.1 — establishing control "results in a Conquer IF that player has not yet scored that
    // Battlefield this turn"; P1 has (by Hold), so no Conquer happened and the conquer ledger stays [].
    // Actual: markScored() pushes A into conqueredThisTurn before the once-per-turn gate → ["A"], which would
    // wrongly satisfy "if you conquered this turn" / "a battlefield you conquered this turn" (unl-019, sfd-015).
    const { game } = await kaisaInto("A");
    expect(game.gameState.conqueredThisTurn[P1]).toEqual([]);
  });

  test("(c) …so Kai'Sa's 'When I conquer, draw 1' does NOT trigger and the Grove (a HOLD ability) does nothing: no chain item, hand size unchanged by the re-entry (471.2.c, 383.4.c.2.a)", async () => {
    const { game, handBeforeMove } = await kaisaInto("A");
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(handBeforeMove);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) contrast: Kai'Sa to B ────────────────────────────────────────────────────────────────

  test("(d) contrast — Kai'Sa → open B instead: P1 has not scored B → (P1, B, conquer, +1) = 5, conqueredThisTurn [B], scoredThisTurn [A, B]", async () => {
    const { game } = await kaisaInto("B");
    expect(bf(game, "B")).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(5);
    expect(game.gameState.conqueredThisTurn[P1]).toEqual(["B"]);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A", "B"]);
    expect(bf(game, "A")?.controller ?? null).toBeNull(); // A stayed vacated
  });

  test("(d) …and Kai'Sa's 'When I conquer' fires at B → P1 draws exactly 1", async () => {
    const { game, handBeforeMove } = await kaisaInto("B");
    expect(game.p1.hand()).toHaveLength(handBeforeMove + 1);
    expect(game.chain()).toEqual([]);
  });

  // ── (e) next P1 turn ─────────────────────────────────────────────────────────────────────────

  test("(e) on P1's NEXT turn the per-turn record is fresh: Kai'Sa alone at A → (P1, A, hold, +1) = 5 and the Grove draws again — re-taking A mid-turn neither banked nor blocked anything", async () => {
    const { game } = await kaisaInto("A");
    expect(game.p1.points()).toBe(4);
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.points()).toBe(4); // nothing on P2's turn
    expect(bf(game, "A")?.controller).toBe(P1);
    const handBefore = game.p1.hand().length;
    await game.p2.endTurn(); // → P1's Beginning Phase
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(5);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.gameState.conqueredThisTurn[P1]).toEqual([]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "A", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(handBefore + 1 + 1); // draw step + Grove
    expect(game.violations()).toEqual([]);
  });
});
