/**
 * Interaction: Charm (ogn-043-298) · Spell · Calm · 1 + [calm] · Action — "Move an enemy unit."  (×3)
 *   × Plundering Poro (sfd-069-221) · Unit · Mind · 2 · 2 Might — "When I conquer, play a Gold gear token exhausted."
 *
 * Rules: 446 / 449 (an effect move is a Move), 190.3.a.1 (the ARRIVING unit's controller applies
 * Contested), 345 (Non-Combat Showdown: the contesting player has Focus even on the opponent's turn),
 * 348.2.a / 348.2.a.1 (showdown ends with only one player's units → that player establishes control →
 * Conquer if not yet scored there this turn), 469.1 / 469.2 (Conquer / Hold), 470 (each battlefield is
 * scored at most once per player per TURN — losing and regaining control does not refresh it), 471.2.a /
 * 471.2.c (conquer triggers fire only on an actual Score), 323.6 / 466.5.b (a battlefield emptied of its
 * controller's units goes uncontrolled at the Cleanup), 315.2.b.2 (Hold in the Beginning Phase; per-turn
 * bookkeeping resets at the turn boundary).
 *
 * Question: 1v1 to 8, P2 on 0, P1's turn, Neutral Open. bfA / bfB empty & uncontrolled. P2's only unit is
 * Plundering Poro in base. P1 has three Charms and [3]+[calm]×3.
 *  (a) Charm Poro base→A, pass/pass: P2 conquers A on P1's turn (+1), Poro's trigger → Gold #1.
 *  (b) Charm Poro A→B, pass/pass: A goes uncontrolled; P2 conquers B too (+1, different battlefield), Gold #2.
 *  (c) Charm Poro B→A, pass/pass: P2 re-establishes control of A but already scored A this turn → NOT a
 *      Conquer: no point, no score event, Poro does NOT trigger (no Gold #3).
 *  (d) P1 ends turn: per-turn flags reset; P2 Holds A in P2's Beginning Phase → +1 (P2 3). Three score
 *      events total: (P2,A,conquer,+1) (P2,B,conquer,+1) (P2,A,hold,+1).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const PLUNDERING_PORO = "sfd-069-221";

function board() {
  return scenario()
    .victoryScore(8)
    .points(P2, 0)
    .resources(P1, { energy: 3, power: { calm: 3 } })
    .battlefield("bfA", { controller: null })
    .battlefield("bfB", { controller: null })
    .unit(P2, "base", PLUNDERING_PORO, "poro")
    .unit(P1, "base", { might: 2, name: "Homebody" }, "home") // P1 has a board but never moves
    .hand(P1, CHARM, "charm1")
    .hand(P1, CHARM, "charm2")
    .hand(P1, CHARM, "charm3");
}

const bf = (game: Game, id: string) => game.gameState.battlefields[id];
const showdown = (game: Game) =>
  game.gameState.interaction?.showdownStack?.at(-1) as
    | { active?: boolean; battlefieldId?: string; focusPlayer?: string | null; isCombatShowdown?: boolean }
    | undefined;

/** The observable per-turn scoring bookkeeping for P2: (points, scoredThisTurn, conqueredThisTurn, points-gained-by-method). */
function ledger(game: Game) {
  const gained = (game.gameState as unknown as { pointsGainedThisTurn?: Record<string, Record<string, number>> }).pointsGainedThisTurn;
  return {
    conquered: [...(game.gameState.conqueredThisTurn?.[P2] ?? [])],
    gained: { ...(gained?.[P2] ?? {}) },
    points: game.p2.points(),
    scored: [...(game.gameState.scoredThisTurn?.[P2] ?? [])],
  };
}

/** Cast one Charm on Poro, name the destination as it is played (355.4), both pass → it resolves (Poro moves). */
async function charmPoroTo(game: Game, charm: string, destination: "battlefield-bfA" | "battlefield-bfB"): Promise<void> {
  await game.p1.cast(charm, { targets: "poro" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick(destination);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf(charm)).toBe("trash");
}

/** Both pass Focus in the auto-begun Non-Combat Showdown (P2 first — P2 contested), then drain any trigger chain. */
async function passPass(game: Game): Promise<void> {
  await game.p2.passFocus();
  await game.p1.passFocus();
  for (let i = 0; i < 6 && game.chain().length > 0 && game.decision()?.kind === "action"; i++) {
    await game.acting().passPriority();
  }
}

/** Steps (a) [and (b) [and (c)]] fully resolved. */
async function after(step: "a" | "b" | "c"): Promise<Game> {
  const game = await board().build();
  await charmPoroTo(game, "charm1", "battlefield-bfA");
  await passPass(game);
  if (step === "a") {
    return game;
  }
  await charmPoroTo(game, "charm2", "battlefield-bfB");
  await passPass(game);
  if (step === "b") {
    return game;
  }
  await charmPoroTo(game, "charm3", "battlefield-bfA");
  await passPass(game);
  return game;
}

describe("Charm ×3 on Plundering Poro — conquer A, conquer B, re-take A (no point) on P1's turn; Hold A next turn", () => {
  // ── (a) base → A ────────────────────────────────────────────────────────────────────────

  test("(a) Charm is an effect move: Poro arrives at A, P2 (the arriving unit's controller) applies Contested, and the Cleanup begins a NON-combat Showdown at A with P2 holding Focus on P1's turn (446/449, 190.3.a.1, 345)", async () => {
    const game = await board().build();
    await charmPoroTo(game, "charm1", "battlefield-bfA");
    expect(game.locationOf("poro")).toBe("bfA");
    expect(game.state("poro").isExhausted).toBe(false); // effect move, not a Standard Move
    expect(bf(game, "bfA")).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfA", focusPlayer: P2, isCombatShowdown: false });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(ledger(game)).toEqual({ conquered: [], gained: {}, points: 0, scored: [] });
  });

  test("(a) pass/pass → only P2's unit at A → P2 establishes control = CONQUER on P1's turn: score event #1 (P2, bfA, conquer, +1); Poro's 'When I conquer' goes on the chain (348.2.a.1, 469.1, 471.2.a)", async () => {
    const game = await board().build();
    await charmPoroTo(game, "charm1", "battlefield-bfA");
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P2 });
    expect(ledger(game)).toEqual({ conquered: ["bfA"], gained: { conquer: 1 }, points: 1, scored: ["bfA"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P2, triggered: true })]);
    expect(game.p2.gear()).toEqual([]); // not yet resolved
  });

  test("(a) Poro's trigger resolves → exactly one Gold gear token in P2's base, EXHAUSTED; back to P1's open main phase", async () => {
    const game = await after("a");
    const gear = game.p2.gear();
    expect(gear).toHaveLength(1);
    expect(game.state(gear[0] as string)).toMatchObject({ isExhausted: true, isToken: true, name: "Gold", zone: "base" });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(0);
  });

  // ── (b) A → B ───────────────────────────────────────────────────────────────────────────

  test("(b) Charm #2 offers base / bfB (not A where Poro stands); Poro leaves A → at the Cleanup A has no P2 unit → A uncontrolled; showdown at B, P2 Focus (323.6, 466.5.b)", async () => {
    const game = await after("a");
    await game.p1.cast("charm2", { targets: "poro" });
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["base", "battlefield-bfB"]);
    await game.p1.pick("battlefield-bfB");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("poro")).toBe("bfB");
    expect(bf(game, "bfA")?.controller).toBeNull();
    expect(bf(game, "bfB")).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfB", focusPlayer: P2, isCombatShowdown: false });
    // Leaving A did not touch the bookkeeping.
    expect(ledger(game)).toEqual({ conquered: ["bfA"], gained: { conquer: 1 }, points: 1, scored: ["bfA"] });
  });

  test("(b) pass/pass → P2 conquers B as well — 470 is per battlefield: score event #2 (P2, bfB, conquer, +1) → P2 2; Poro triggers again → Gold #2 exhausted", async () => {
    const game = await after("a");
    await charmPoroTo(game, "charm2", "battlefield-bfB");
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: P2 });
    expect(ledger(game)).toEqual({ conquered: ["bfA", "bfB"], gained: { conquer: 2 }, points: 2, scored: ["bfA", "bfB"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P2, triggered: true })]);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    const gear = game.p2.gear();
    expect(gear).toHaveLength(2);
    for (const g of gear) {
      expect(game.state(g)).toMatchObject({ isExhausted: true, isToken: true, name: "Gold" });
    }
    expect(bf(game, "bfA")?.controller).toBeNull();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (c) B → A again ─────────────────────────────────────────────────────────────────────

  test("(c) Charm #3 B→A: B goes uncontrolled; showdown at A (P2 Focus); pass/pass → P2 re-establishes CONTROL of A …", async () => {
    const game = await after("b");
    await charmPoroTo(game, "charm3", "battlefield-bfA");
    expect(game.locationOf("poro")).toBe("bfA");
    expect(bf(game, "bfB")?.controller).toBeNull();
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfA", focusPlayer: P2, isCombatShowdown: false });
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P2 });
  });

  test("(c) … but P2 already scored A this turn (470 / 348.2.a.1): NOT a Conquer — pointDelta 0, no score event (ledger unchanged), and Poro's 'When I conquer' does NOT trigger (471.2.c): chain empty, still exactly two Gold tokens", async () => {
    const game = await after("b");
    const before = ledger(game);
    expect(before).toEqual({ conquered: ["bfA", "bfB"], gained: { conquer: 2 }, points: 2, scored: ["bfA", "bfB"] });
    const handBefore = game.p2.hand().length;
    await charmPoroTo(game, "charm3", "battlefield-bfA");
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.chain()).toEqual([]); // no Poro trigger
    expect(ledger(game)).toEqual(before); // no point, scored/conquered lists not extended
    expect(game.p2.hand()).toHaveLength(handBefore); // and no 471.1.b "draw instead" either — there was no Score at all
    expect(game.p2.gear()).toHaveLength(2);
    expect(bf(game, "bfA")?.controller).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (d) turn boundary → Hold ────────────────────────────────────────────────────────────

  test("(d) P1 ends the turn: per-turn bookkeeping resets at the turn boundary and P2 HOLDS A in P2's Beginning Phase — score event #3 (P2, bfA, hold, +1) → P2 3; nothing triggers (Poro has no hold ability), still two Gold tokens (315.2.b.2, 469.2)", async () => {
    const game = await after("c");
    expect(game.p2.points()).toBe(2);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(ledger(game)).toEqual({ conquered: [], gained: { hold: 1 }, points: 3, scored: ["bfA"] });
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual([]);
    expect(bf(game, "bfA")?.controller).toBe(P2);
    expect(bf(game, "bfB")?.controller).toBeNull();
    expect(game.locationOf("poro")).toBe("bfA");
    expect(game.p2.gear()).toHaveLength(2);
    expect(game.chain()).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("net: P2 0 → 3 from exactly three score events (conquer A + conquer B on P1's turn, hold A on P2's turn) and exactly two Gold tokens", async () => {
    const game = await board().build();
    type ScoreEvent = { seat: string; battlefieldId: string; method: "conquer" | "hold"; pointDelta: number };
    const events: ScoreEvent[] = [];
    /** Diff the P2 ledger across `step`: every battlefield newly marked scored is one score event. */
    const record = async (before: ReturnType<typeof ledger>, step: () => Promise<unknown>) => {
      await step();
      const now = ledger(game);
      for (const b of now.scored.filter((x) => !before.scored.includes(x))) {
        const method = now.conquered.includes(b) && !before.conquered.includes(b) ? "conquer" : "hold";
        events.push({ battlefieldId: b, method, pointDelta: (now.gained[method] ?? 0) - (before.gained[method] ?? 0), seat: P2 });
      }
    };
    await record(ledger(game), () => charmPoroTo(game, "charm1", "battlefield-bfA").then(() => passPass(game)));
    await record(ledger(game), () => charmPoroTo(game, "charm2", "battlefield-bfB").then(() => passPass(game)));
    await record(ledger(game), () => charmPoroTo(game, "charm3", "battlefield-bfA").then(() => passPass(game)));
    expect(events).toHaveLength(2); // (c) produced nothing
    // The turn boundary resets the bookkeeping, so the Hold is diffed against an empty ledger.
    await record({ conquered: [], gained: {}, points: 2, scored: [] }, () => game.advanceTurn());
    expect(events).toEqual([
      { battlefieldId: "bfA", method: "conquer", pointDelta: 1, seat: P2 },
      { battlefieldId: "bfB", method: "conquer", pointDelta: 1, seat: P2 },
      { battlefieldId: "bfA", method: "hold", pointDelta: 1, seat: P2 },
    ]);
    expect(game.p2.points()).toBe(3);
    expect(game.p2.gear()).toHaveLength(2);
  });
});
