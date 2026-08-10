/**
 * Interaction: Sumpworks Map (unl-085-219) · Gear · Mind · [2] · "[Reaction] [Temporary] When an opponent scores, draw 1." — P1's
 *   × Kai'Sa, Survivor (ogn-039-298) · Champion Unit · Fury · [4] · 4 Might · "[Accelerate] When I conquer, draw 1." — P2's
 *   × Charm (ogn-043-298) · Spell · Calm · [1][calm] · Action · "Move an enemy unit." — P1's
 *
 * Board (1v1, Victory 8): P2 on 2 points. P1 has Sumpworks Map on its board. Battlefield A is empty and
 * uncontrolled. P2's Kai'Sa, Survivor is ready in P2's base.
 *   Case OPP-TURN: it is P1's turn; P1 casts Charm moving Kai'Sa base → A; both pass the showdown.
 *   Case OWN-TURN: it is P2's turn; P2 Standard-Moves Kai'Sa to A; both pass the showdown.
 * In both cases P2 Conquers A and exactly two abilities trigger off that one score — P2's Kai'Sa and P1's Map.
 *
 * Question: (a) score tuple in each case; does conquering on the opponent's turn score normally and consume
 * P2's once-per-turn allowance for A (Charm out and back in the same P1 turn → no second point / draw / Map
 * draw)? (b) In which order are the two triggers placed and resolved — keyed to the SCORING player or to the
 * TURN player? Does anyone get an `order` Decision?
 *
 * Expected:
 *   (a) Both cases: Kai'Sa contests A (190.3.a.1) → Non-Combat Showdown, P2 has Focus (345) → pass/pass →
 *       348.2.a.1 / 469.1: (P2, A, conquer, +1) 2→3 regardless of whose turn it is (466.5.e). Kai'Sa's conquer
 *       trigger (471.2.a) and the Map's "an opponent scored" both fire. In OPP-TURN scoredThisTurn[P2]=[A] for
 *       P1's turn: Charm A→base (A uncontrolled again) then base→A the same turn only re-establishes control —
 *       no Score (470): pointDelta 0, no Kai'Sa trigger (471.2.c), no Map trigger.
 *   (b) 383.3.d.1: simultaneous triggers of different controllers are placed TURN PLAYER first; later-placed
 *       = higher = resolves first (LIFO). OPP-TURN (P1's turn): Map (P1) bottom, Kai'Sa (P2) on top → Kai'Sa's
 *       draw resolves FIRST. OWN-TURN (P2's turn): Kai'Sa bottom, Map on top → Map's draw resolves FIRST. One
 *       item per seat → no `order` Decision for anyone. Net cards +1 each; the observable chain order flips
 *       with whose TURN it is, not with who scored.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SUMPWORKS_MAP = "unl-085-219";
const KAISA_SURVIVOR = "ogn-039-298";
const CHARM = "ogn-043-298";

/** P2 on 2/8; P1: Map on board, three Charms in hand + [3] and 3 calm; bfA open & empty; Kai'Sa ready in P2's base. */
function board(active: typeof P1 | typeof P2) {
  return scenario()
    .active(active)
    .victoryScore(8)
    .points(P2, 2)
    .resources(P1, { energy: 3, power: { calm: 3 } })
    .battlefield("bfA", { controller: null })
    .gear(P1, SUMPWORKS_MAP, "map")
    .unit(P2, "base", KAISA_SURVIVOR, "kaisa")
    .hand(P1, CHARM, "charm1")
    .hand(P1, CHARM, "charm2")
    .hand(P1, CHARM, "charm3");
}

const chainView = (game: Game): string[][] => game.chain().map((c) => [c.cardId, c.controller]);
const isOpenMain = (d: Decision | null): boolean => d?.kind === "action" && d.context === "main";
const isShowdownFocus = (seat: string) => (d: Decision | null): boolean => d?.kind === "action" && d.context === "showdown" && d.seat === seat;
const isChainPriority = (d: Decision | null): boolean => d?.kind === "action" && d.context === "chain";

/** Step with passes / forced answers only until `pred` holds; records every decision kind seen. */
async function until(game: Game, pred: (d: Decision | null) => boolean, seen: string[] = [], max = 40): Promise<Decision | null> {
  for (let i = 0; i < max && !pred(game.decision()); i++) {
    const r = await game.settle({ maxSteps: 1 });
    const d = game.decision();
    if (d) {
      seen.push(`${d.seat}:${d.kind}`);
    }
    if (r.reason === "unanswered" || r.reason === "game-over") {
      break;
    }
  }
  expect(pred(game.decision())).toBe(true);
  return game.decision();
}

/** OPP-TURN: P1's turn; Charm resolves and moves Kai'Sa base→A (only destination); step to P2's showdown Focus. */
async function oppTurnAtShowdown(): Promise<{ game: Game; seen: string[] }> {
  const game = await board(P1).build();
  const seen: string[] = [];
  await game.p1.cast("charm1", { targets: "kaisa" });
  await until(game, isShowdownFocus(P2), seen);
  return { game, seen };
}

/** OWN-TURN: P2's turn; Kai'Sa Standard-Moves to A → showdown with P2's Focus. */
async function ownTurnAtShowdown(): Promise<Game> {
  const game = await board(P2).build();
  await game.p2.move("kaisa", "bfA");
  expect(isShowdownFocus(P2)(game.decision())).toBe(true);
  return game;
}

/** Both pass Focus → conquer → the two triggers are on the chain, first priority window open. */
async function passShowdown(game: Game, seen: string[] = []): Promise<void> {
  await game.p2.passFocus();
  await game.p1.passFocus();
  await until(game, isChainPriority, seen);
}

describe("Sumpworks Map × Kai'Sa, Survivor — conquer on either player's turn; trigger order follows the TURN player", () => {
  // ── (a) OPP-TURN scoring ─────────────────────────────────────────────────────────────────────

  test("OPP-TURN (a): Charm moves Kai'Sa base→A on P1's turn; A becomes Contested by P2 and a NON-combat showdown opens with P2 (who applied Contested) holding Focus (190.3.a.1, 345)", async () => {
    const { game } = await oppTurnAtShowdown();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.locationOf("kaisa")).toBe("bfA");
    expect(game.zoneOf("charm1")).toBe("trash");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ battlefieldId: "bfA", focusPlayer: P2, isCombatShowdown: false });
    expect(game.p2.points()).toBe(2);
  });

  test("OPP-TURN (a): pass/pass → P2 CONQUERS A on P1's turn: (P2, A, conquer, +1) 2→3, scoredThisTurn[P2]=[A]; whose turn it is does not matter (348.2.a.1, 469.1, 466.5.e)", async () => {
    const { game } = await oppTurnAtShowdown();
    await passShowdown(game);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(3);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.scoredThisTurn[P2]).toEqual(["bfA"]);
    expect(game.gameState.scoredThisTurn[P1]).toEqual([]);
    expect(game.isOver()).toBe(false);
  });

  test("OPP-TURN (a): exactly two triggered items arise off that one score — Kai'Sa's 'When I conquer' (P2) and the Map's 'When an opponent scores' (P1) — and no `order` Decision was shown to either seat", async () => {
    const { game, seen } = await oppTurnAtShowdown();
    await passShowdown(game, seen);
    const items = game.chain();
    expect(items).toHaveLength(2);
    expect(items).toContainEqual(expect.objectContaining({ cardId: "kaisa", controller: P2, triggered: true }));
    expect(items).toContainEqual(expect.objectContaining({ cardId: "map", controller: P1, triggered: true }));
    expect(seen.some((s) => s.endsWith(":order"))).toBe(false);
  });

  test("OPP-TURN (b): on P1's turn the TURN PLAYER's Map is placed first (bottom) and P2's Kai'Sa on TOP — so Kai'Sa's draw (P2) resolves FIRST, then the Map's (383.3.d.1, LIFO)", async () => {
    // Expected: chain bottom→top = [map (P1), kaisa (P2)]; first resolution gives P2 its card while P1 still has 2.
    // Actual: the engine appends the scorer's Kai'Sa first and the Map on top regardless of whose turn it is,
    // so the Map (P1) resolves first — the order is keyed to the scoring player, not the Turn Player.
    const { game } = await oppTurnAtShowdown();
    await passShowdown(game);
    expect(chainView(game)).toEqual([
      ["map", P1],
      ["kaisa", P2],
    ]);
    const p1Hand = game.p1.hand().length; // 2 Charms left
    const p2Hand = game.p2.hand().length;
    await until(game, () => game.chain().length === 1);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1); // Kai'Sa's draw came first
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(chainView(game)).toEqual([["map", P1]]);
  });

  test("OPP-TURN (a/b): after both resolve — net +1 card each (P2 off Kai'Sa, P1 off the Map), P2 on 3, Kai'Sa controls A, back to P1's open main phase", async () => {
    const { game } = await oppTurnAtShowdown();
    const p1Hand = game.p1.hand().length; // charm2, charm3
    const p2Hand = game.p2.hand().length;
    await passShowdown(game);
    await until(game, isOpenMain);
    expect(game.decision()?.seat).toBe(P1);
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p2.points()).toBe(3);
    expect(game.gameState.battlefields.bfA?.controller).toBe(P2);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("OPP-TURN (a): once-per-turn — Charm Kai'Sa A→base (A lapses to uncontrolled), then Charm her base→A again the SAME P1 turn: P2 merely re-establishes control — no point (stays 3), no Kai'Sa draw, no Map draw, no triggered item at all (470, 471.2.c)", async () => {
    const { game } = await oppTurnAtShowdown();
    await passShowdown(game);
    await until(game, isOpenMain);
    const p2HandAfterFirst = game.p2.hand().length;
    const p1HandAfterFirst = game.p1.hand().length; // charm2, charm3 + the Map's card
    // out
    await game.p1.cast("charm2", { targets: "kaisa" });
    await until(game, isOpenMain);
    expect(game.locationOf("kaisa")).toBe("base");
    expect(game.gameState.battlefields.bfA?.controller).toBe(null);
    // back in
    await game.p1.cast("charm3", { targets: "kaisa" });
    const seen: string[] = [];
    let sawTrigger = false;
    for (let i = 0; i < 40 && !isOpenMain(game.decision()); i++) {
      sawTrigger ||= game.chain().some((c) => c.triggered);
      await game.settle({ maxSteps: 1 });
      const d = game.decision();
      if (d) {
        seen.push(`${d.seat}:${d.kind}`);
      }
    }
    expect(isOpenMain(game.decision())).toBe(true);
    expect(sawTrigger).toBe(false);
    expect(game.locationOf("kaisa")).toBe("bfA");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(3);
    expect(game.gameState.scoredThisTurn[P2]).toEqual(["bfA"]);
    expect(game.p2.hand()).toHaveLength(p2HandAfterFirst); // no second Kai'Sa draw
    expect(game.p1.hand()).toHaveLength(p1HandAfterFirst - 2); // two Charms spent, no second Map draw
    expect(game.turnPlayer()).toBe(P1);
  });

  // ── OWN-TURN ────────────────────────────────────────────────────────────────────────────────

  test("OWN-TURN (a): P2 Standard-Moves Kai'Sa to A on P2's turn; pass/pass → the same score tuple (P2, A, conquer, +1) 2→3 and the same two triggers, no `order` prompt", async () => {
    const game = await ownTurnAtShowdown();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("kaisa").isExhausted).toBe(true);
    const seen: string[] = [];
    await passShowdown(game, seen);
    expect(game.p2.points()).toBe(3);
    expect(game.gameState.scoredThisTurn[P2]).toEqual(["bfA"]);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P2 });
    const items = game.chain();
    expect(items).toHaveLength(2);
    expect(items).toContainEqual(expect.objectContaining({ cardId: "kaisa", controller: P2, triggered: true }));
    expect(items).toContainEqual(expect.objectContaining({ cardId: "map", controller: P1, triggered: true }));
    expect(seen.some((s) => s.endsWith(":order"))).toBe(false);
  });

  test("OWN-TURN (b): on P2's turn the TURN PLAYER's Kai'Sa is placed first (bottom) and P1's Map on TOP — the Map's draw (P1) resolves FIRST, then Kai'Sa's (383.3.d.1, LIFO)", async () => {
    const game = await ownTurnAtShowdown();
    await passShowdown(game);
    expect(chainView(game)).toEqual([
      ["kaisa", P2],
      ["map", P1],
    ]);
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await until(game, () => game.chain().length === 1);
    expect(game.p1.hand()).toHaveLength(p1Hand + 1); // the Map's draw came first
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(chainView(game)).toEqual([["kaisa", P2]]);
    await until(game, isOpenMain);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.decision()?.seat).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("(b) the placement flips with whose TURN it is, not with who scored: P2 scores in both cases, yet the TOP item is Kai'Sa (P2) on P1's turn and the Map (P1) on P2's turn (383.3.d.1)", async () => {
    // Expected: top item = the NON-turn player's trigger in each case. Actual: the Map (P1) is on top in
    // both cases — the engine's placement does not depend on the Turn Player.
    const own = await ownTurnAtShowdown();
    await passShowdown(own);
    const { game: opp } = await oppTurnAtShowdown();
    await passShowdown(opp);
    expect(own.gameState.scoredThisTurn[P2]).toEqual(["bfA"]);
    expect(opp.gameState.scoredThisTurn[P2]).toEqual(["bfA"]);
    expect(own.chain().at(-1)).toMatchObject({ cardId: "map", controller: P1 });
    expect(opp.chain().at(-1)).toMatchObject({ cardId: "kaisa", controller: P2 });
  });
});
