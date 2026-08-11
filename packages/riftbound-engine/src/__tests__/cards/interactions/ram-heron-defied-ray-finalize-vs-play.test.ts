/**
 * Interaction: Battering Ram (sfd-012-221) · Unit · Fury · 5 · 5 Might
 *     "I cost [1] less for each card you've played this turn, to a minimum of [1]."
 *   × Astral Heron (ven-044-166) · Unit · Calm · 7 · 7 Might
 *     "When you play your first card each turn, if I'm at a battlefield, your next card costs
 *      [2][rainbow][rainbow] less."
 *   × Defy (ogn-045-298) · Spell · Calm · 1+[calm] · Reaction
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   with Hextech Ray (ogn-009-298, 1+[fury], "Deal 3 to a unit at a battlefield") as P1's first card.
 *
 * Question: ONE countered spell, TWO "cards played" consumers keyed off DIFFERENT events. P1's turn,
 * nothing played; Astral Heron at bf1 (P1's); hand: Ray, Battering Ram, a second Ray. P2: a unit at
 * bf2, Defy in hand. Line A: Ray resolves. Line B: P2 Defies the Ray. Then P1 plays Ram, then Ray #2.
 *   (a) Line A: Heron triggers on Ray? Ram's exact cost (own −1 and Heron −2[A][A] together)?
 *   (b) Line B: does the countered Ray count for Ram (finalized) — 4 or 5? Heron trigger on it?
 *   (c) Line B cont.: is RAM now "your first card played" so Heron triggers on it → Ray #2 −[2][A][A]?
 *   (d) Line A cont.: Ray #2's cost?   (e) Heron in base: Ram in A / B?
 *   Parity {5, fury 2} and {4, fury 2}.
 *
 * Rules: 419.4.a (play-triggers fire when the card RESOLVES), 419.4.a.1 / 425.1.b (a countered card was
 * never "played" for triggers), 419.4.b (non-triggered checks count FINALIZED cards — the CR's own
 * example: spell Defied → Ram costs [4]), 425.1.c (no refund), 356.4.d/.e (Ram's floor binds only its own
 * reduction; total-cost discounts after component ones), 356.4.f (a discount may eat a pip to 0), 390.4 /
 * 391 (Heron's "next card" is a one-shot consumed by the next play), 383.2.a.1.
 *
 * Expected: (a) Heron triggers on Ray; Ram = 5−1 = 4, −2 → 2 energy, [A][A] unused. (b) Ram = 4 (Ray was
 * finalized); NO Heron trigger on the countered Ray. (c) Yes — Heron triggers on Ram; Ray #2 → 0/0.
 * (d) Ray #2 full 1+[fury] (discount consumed by Ram). (e) 4 / 4. Parity {5,f2}: A Ram leaves {2,f1},
 * B Ram leaves {0,f1} and Ray #2 is still castable at 0/0. {4,f2}: A offered (2), B NOT offered (needs 4).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BATTERING_RAM = "sfd-012-221";
const ASTRAL_HERON = "ven-044-166";
const DEFY = "ogn-045-298";
const HEXTECH_RAY = "ogn-009-298";

interface Opts {
  /** Where Astral Heron stands: alone at bf1 (default) or in P1's base with a vanilla Holder keeping bf1. */
  heron?: "bf1" | "base";
  energy?: number;
  fury?: number;
}

/**
 * P1's turn 2, open main phase, nothing played. P1: Heron (bf1 or base), hand Ray + Ram + Ray #2,
 * pool {energy (5), fury (2)}. P2: 5-Might Foe at bf2, Defy in hand + exactly {1, calm 1}.
 */
function board(o: Opts = {}) {
  const b = scenario()
    .resources(P1, { energy: o.energy ?? 5, power: { fury: o.fury ?? 2 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 5, name: "Foe" }, "foe")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P1, BATTERING_RAM, "ram")
    .hand(P1, HEXTECH_RAY, "ray2")
    .hand(P2, DEFY, "defy");
  if ((o.heron ?? "bf1") === "bf1") {
    b.unit(P1, "bf1", ASTRAL_HERON, "heron");
  } else {
    b.unit(P1, "base", ASTRAL_HERON, "heron").unit(P1, "bf1", { might: 2, name: "Holder" }, "holder");
  }
  return b;
}

/** Line A: Ray at Foe, everybody passes, it resolves. Back in P1's open main phase. */
async function lineA(o: Opts = {}): Promise<Game> {
  const game = await board(o).build();
  await game.p1.cast("ray", { targets: "foe" });
  await game.settle();
  expect(game.zoneOf("ray")).toBe("trash");
  expect(game.state("foe").damage).toBe(3);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

/** Line B: Ray at Foe, P1 passes, P2 Defies it, both resolve (Ray countered). Back in P1's open main phase. */
async function lineB(o: Opts = {}): Promise<Game> {
  const game = await board(o).build();
  await game.p1.cast("ray", { targets: "foe" });
  await game.p1.passPriority();
  expect(game.p2.can("cast", "defy")).toBe(true);
  await game.p2.cast("defy", { targets: "ray" });
  await game.settle();
  expect(game.zoneOf("ray")).toBe("trash");
  expect(game.zoneOf("defy")).toBe("trash");
  expect(game.state("foe").damage).toBe(0);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

/** Source cards of P1's pending one-shot cost replacements (Heron's "next card costs less"). */
const pendingDiscounts = (game: Game): string[] =>
  (game.gameState.activeReplacements ?? []).map((r) => (r as { sourceCardId?: string }).sourceCardId ?? "?").sort();

/** The energy the play menu quotes for Ram (to base). */
function ramQuote(game: Game): number | undefined {
  const v = (game.p1.option("play", "ram")?.variants ?? []).find((x) => (x.params as { location?: string }).location === "base");
  return (v?.params as { quote?: { energy?: number } } | undefined)?.quote?.energy;
}

describe("Battering Ram × Astral Heron × a Defied Hextech Ray — 'finalized' vs 'played'", () => {
  test("setup: Defy (≤[4], ≤[rainbow]) is a legal answer to Ray (printed 1+[fury]) and P1's Ray payment is never refunded (206, 425.1.c)", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1 } });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "ray" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ray", "defy"]);
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1 } }); // nothing back
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  // ---- (a) Line A ------------------------------------------------------------------------------------

  test("(a) Line A: Ray resolving = P1's first card PLAYED with Heron at a battlefield → Heron's trigger resolves and its next-card discount is pending (419.4.a)", async () => {
    const game = await lineA();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(pendingDiscounts(game)).toEqual(["heron"]);
    expect(game.chain()).toEqual([]);
  });

  test("(a) Line A: Ram = 5 − 1 (one card finalized) = 4, then Heron −2 → quoted and charged exactly 2 energy; the [A][A] half finds no power to reduce, fury untouched (356.4.d/.e)", async () => {
    const game = await lineA();
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1 } });
    expect(ramQuote(game)).toBe(2);
    await game.p1.play("ram");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
    expect(game.zoneOf("ram")).toBe("base");
    expect(pendingDiscounts(game)).toEqual([]); // Heron's one-shot consumed by Ram (391)
  });

  test("(d) Line A continued: Heron's discount was consumed by Ram and Ram is not P1's first card → Ray #2 costs the full 1+[fury]: {2,f1} → {1,f0}", async () => {
    const game = await lineA();
    await game.p1.play("ram");
    await game.settle();
    expect(game.chain()).toEqual([]); // no second Heron trigger — Ram was P1's SECOND card played
    expect(pendingDiscounts(game)).toEqual([]);
    await game.p1.cast("ray2", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 0 } });
  });

  // ---- (b)/(c) Line B ----------------------------------------------------------------------------------

  test("(b) Line B: the countered Ray was never PLAYED for triggers — Heron does NOT trigger, no discount is pending (419.4.a.1, 425.1.b)", async () => {
    const game = await lineB();
    expect(pendingDiscounts(game)).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  test("(b) Line B: …but it WAS finalized, so Ram counts it: quoted and charged exactly 4 (419.4.b — the CR's own Defy/Ram example), not 5 and not 2", async () => {
    const game = await lineB();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(ramQuote(game)).toBe(4);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1 } });
    await game.p1.play("ram");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    expect(game.zoneOf("ram")).toBe("base");
  });

  test("(c) Line B continued: Ram is the first card P1 actually PLAYED this turn → Heron triggers on Ram (item on the chain, P2 gets a window), and on resolution the next-card discount is pending", async () => {
    const game = await lineB();
    await game.p1.play("ram");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "heron", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(pendingDiscounts(game)).toEqual(["heron"]);
  });

  test("(c) Line B continued: Ray #2 is 'your next card': 1+[fury] − [2][A][A] → 0 energy AND 0 power — the [A] discount eats the fury pip (356.4.f); castable from {0, f1} and leaves {0, f1}", async () => {
    const game = await lineB();
    await game.p1.play("ram");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    expect(game.p1.can("cast", "ray2")).toBe(true);
    await game.p1.cast("ray2", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    expect(pendingDiscounts(game)).toEqual([]);
    await game.settle();
    expect(game.state("foe").damage).toBe(3);
    expect(game.zoneOf("ray2")).toBe("trash");
  });

  // ---- (e) Heron in base --------------------------------------------------------------------------------

  test("(e) Heron in BASE: 'if I'm at a battlefield' fails in both lines — Ram costs 4 after a resolved Ray (A) and 4 after a Defied Ray (B)", async () => {
    const a = await lineA({ heron: "base" });
    expect(pendingDiscounts(a)).toEqual([]);
    expect(ramQuote(a)).toBe(4);
    await a.p1.play("ram");
    expect(a.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });

    const b = await lineB({ heron: "base" });
    expect(pendingDiscounts(b)).toEqual([]);
    expect(ramQuote(b)).toBe(4);
    await b.p1.play("ram");
    expect(b.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
  });

  // ---- parity ---------------------------------------------------------------------------------------------

  test("parity {5, fury 2}: after Ray {4,f1} Ram is offered in A (at 2 → leaves {2,f1}) and in B (at 4 → leaves {0,f1})", async () => {
    const a = await lineA();
    expect(a.p1.can("play", "ram")).toBe(true);
    await a.p1.play("ram");
    expect(a.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });

    const b = await lineB();
    expect(b.p1.can("play", "ram")).toBe(true);
    await b.p1.play("ram");
    expect(b.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
  });

  test("parity {4, fury 2}: after Ray {3,f1} Ram IS offered in Line A (costs 2) but is NOT offered in Line B (needs 4) — play rejected, Ram stays in hand", async () => {
    const a = await lineA({ energy: 4 });
    expect(a.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    expect(a.p1.can("play", "ram")).toBe(true);
    await a.p1.play("ram");
    expect(a.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });

    const b = await lineB({ energy: 4 });
    expect(b.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    expect(b.p1.can("play", "ram")).toBe(false);
    await expect(b.p1.play("ram")).rejects.toThrow();
    expect(b.zoneOf("ram")).toBe("hand");
    expect(b.violations()).toEqual([]);
  });
});
