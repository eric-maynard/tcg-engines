/**
 * Interaction: Acceleration Gate (ven-150-166) × Dragonsoul Sage (unl-093-219) × Defy (ogn-045-298)
 *
 *   Acceleration Gate — Spell · Mind/Body · 3 + [rainbow] · "Ready up to 4 units, gear, and/or runes."
 *   Dragonsoul Sage — Unit · Body · 2 · 1 Might · "[Reaction][>] [Exhaust]: [Add] [1]. (Abilities that add
 *     resources can't be reacted to.)"
 *   Defy — Spell · Calm · 1 + [calm] · [Reaction] "Counter a spell that costs no more than [4] and no more
 *     than [rainbow]."
 *
 * Rules: 429.2 / 429.2.a (an Add ABILITY finalizes and resolves at once — no chain item, no priority
 * passes), 429.2.b (a resource-ish SPELL still lingers), 359.3 / 359.3.a / 359.3.c (spells linger; others
 * get a Reaction window), 337.4, 346.1 / 340.2 (an Add never opens a chain; when the Gate's chain empties
 * play just continues in P1's Open State), 135.2.e.5.a ([rainbow] = power of any domain), 425.1.c (a
 * counter refunds nothing), 164.2.a (a ready rune's [E]: Add [1] — no once-per-turn limit), 813.1.c.2.
 *
 * Question: P1's Main Phase. P1: ready Dragonsoul Sage, four EXHAUSTED Mind runes, pool exactly 3 + [mind]
 * (the Gate's cost). P2: pool 1 + [calm], Defy in hand.
 *  (a) P1 exhausts the Sage: chain? P2 priority? Defy offered? who acts next? pool delta?
 *  (b) P1 casts the Gate on the four runes: does it linger, does P2 get a window, is it a legal Defy target?
 *  (c) Branch 1 — P2 Defies: runes / both pools / refunds. Branch 2 — P2 passes: runes ready; may P1
 *      re-tap all four at once, and what is the pool?
 *  (d) What passes to P2 when the Gate's chain closes, versus the Sage which opened no chain at all?
 *
 * Expected: (a) nothing on the chain, no P2 decision, Defy never offered, P1 still to act, +1 energy.
 * (b) Gate = finalized chain item, P1 then P2 priority, Gate (3 ≤ 4, 1 ≤ 1) is Defy's one legal target.
 * (c1) P2 → 0/0, Gate countered → P1's trash, runes stay exhausted, P1's 3 + power NOT refunded.
 * (c2) Gate resolves → four runes ready → P1 taps all four chain-lessly → pool 1 (Sage) + 4 = 5.
 * (d) exactly one P2 decision point for the Gate, zero for the Sage; afterwards P1's Neutral Open either way.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GATE = "ven-150-166";
const SAGE = "unl-093-219";
const DEFY = "ogn-045-298";
const RUNES = ["r1", "r2", "r3", "r4"] as const;

function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const opt = game[seat].option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);
const readyRunes = (game: Game) => new Set(game.p1.runes({ ready: true }));

/** P1's turn. P1: ready Sage, r1–r4 exhausted Mind runes, exactly 3 + [mind], Gate in hand. P2: 1 + [calm], Defy. */
function board() {
  const s = scenario()
    .resources(P1, { energy: 3, power: { mind: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .unit(P1, "base", SAGE, "sage")
    .hand(P1, GATE, "gate")
    .hand(P2, DEFY, "defy");
  for (const r of RUNES) {
    s.rune(P1, "mind", { alias: r, exhausted: true });
  }
  return s;
}

describe("Acceleration Gate vs Dragonsoul Sage against a held Defy — a spell opens a window, an Add ability opens nothing", () => {
  // ── (a) the Sage's Add ─────────────────────────────────────────────────────────────────────

  test("(a) exhausting Dragonsoul Sage: +1 energy at once (3 → 4, power untouched), the Sage is exhausted, NOTHING goes on the chain and P1 is still the one to act in its Neutral Open (429.2 / 429.2.a / 346.1)", async () => {
    const game = await board().build();
    expect(game.p1.resources()).toEqual({ energy: 3, power: { mind: 1 } });
    await game.p1.activate("sage");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { mind: 1 } });
    expect(game.state("sage").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(a) P2 never receives priority off the Sage and Defy is never offered against it — P2 has no menu at all before, 'during' or after the activation (it targets spells only, and there is no window anyway)", async () => {
    const game = await board().build();
    expect(game.p2.legal()).toEqual([]);
    expect(game.p2.can("cast", "defy")).toBe(false);
    await game.p1.activate("sage");
    expect(game.p2.decision()).toBeNull();
    expect(game.p2.legal()).toEqual([]);
    expect(game.p2.can("cast", "defy")).toBe(false);
    await expect(game.p2.cast("defy", { targets: "sage" })).rejects.toThrow();
    expect(game.zoneOf("defy")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } });
  });

  // ── (b) the Gate is a spell ────────────────────────────────────────────────────────────────

  test("(b) Acceleration Gate offers the four exhausted runes (and the Sage); cast on r1–r4 it debits 3 energy + the [mind] as its [rainbow] (135.2.e.5.a) and LINGERS as a finalized chain item naming them (359.3.a) — nothing is readied yet", async () => {
    const game = await board().build();
    const offered = targetsOffered(game, "p1", "gate");
    for (const r of RUNES) {
      expect(offered).toContain(r);
    }
    await game.p1.cast("gate", { targets: [...RUNES] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gate", controller: P1, triggered: false, type: "spell" })]);
    expect(new Set(game.chain()[0]?.targets ?? [])).toEqual(new Set(RUNES));
    expect(readyRunes(game)).toEqual(new Set());
    expect(game.zoneOf("gate")).toBe("chain");
  });

  test("(b) P1 holds priority first, then P2 gets a real Reaction window (337.4 / 359.3.c) in which Defy is castable with exactly ONE legal target: the Gate (3 ≤ 4 energy, 1 ≤ 1 power)", async () => {
    const game = await board().build();
    await game.p1.cast("gate", { targets: [...RUNES] });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(targetsOffered(game, "p2", "defy")).toEqual(["gate"]);
  });

  // ── (c) Branch 1: P2 Defies ────────────────────────────────────────────────────────────────

  test("(c1) P2 Defies: P2 pays 1 + [calm] → 0/0; LIFO — Defy resolves first and counters the Gate → P1's trash; the four runes stay EXHAUSTED; P1's 3 energy + power are NOT refunded (425.1.c); Defy → P2's trash", async () => {
    const game = await board().build();
    await game.p1.cast("gate", { targets: [...RUNES] });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "gate" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(chainIds(game)).toEqual(["gate", "defy"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("gate")).toBe("trash");
    expect(game.p1.trash()).toContain("gate");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p2.trash()).toContain("defy");
    expect(readyRunes(game)).toEqual(new Set());
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.p1.can("tapRune")).toBe(false); // nothing to tap — the Gate did nothing
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c1) with the Sage tapped BEFORE casting, its floating 1 energy survives the counter — only what was actually paid into the Gate is lost", async () => {
    const game = await board().build();
    await game.p1.activate("sage");
    await game.p1.cast("gate", { targets: [...RUNES] });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 0 } });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "gate" });
    await game.settle();
    expect(game.zoneOf("gate")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 0 } });
  });

  // ── (c) Branch 2: P2 passes ────────────────────────────────────────────────────────────────

  test("(c2) P2 passes: the Gate resolves → r1–r4 are READY, Gate → trash, P2 keeps its 1 + [calm] and Defy", async () => {
    const game = await board().build();
    await game.p1.cast("gate", { targets: [...RUNES] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("gate")).toBe("trash");
    expect(readyRunes(game)).toEqual(new Set(RUNES));
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    expect(game.p2.hand()).toEqual(["defy"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(c2) …and P1 may immediately re-tap all four (a rune's [E] only needs it ready NOW — no once-per-turn memory, 164.2.a): each tap is chain-less with no P2 decision; with the Sage too the pool ends at 0 → +1 (Sage) −(3+[mind]) Gate → +4 = 5 energy, i.e. 3E + 1P became 4E", async () => {
    const game = await board().build();
    await game.p1.activate("sage"); // 4 + [mind]
    await game.p1.cast("gate", { targets: [...RUNES] }); // 1 + —
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 0 } });
    for (const [i, r] of RUNES.entries()) {
      await game.p1.tapRune(r);
      expect(game.p1.energy()).toBe(2 + i);
      expect(game.chain()).toEqual([]);
      expect(game.p2.legal()).toEqual([]);
      expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    }
    expect(game.p1.resources()).toEqual({ energy: 5, power: { mind: 0 } });
    expect(readyRunes(game)).toEqual(new Set());
    expect(game.violations()).toEqual([]);
  });

  // ── (d) one P2 decision point versus zero ──────────────────────────────────────────────────

  test("(d) the observable difference: the Sage activation yields ZERO P2 decisions and leaves P1 in the same Neutral Open; the Gate yields exactly ONE P2 decision (its Reaction window) and, once its chain empties, play simply continues in P1's Neutral Open — no Focus/priority is handed to P2 (340.2, 346.1)", async () => {
    const game = await board().build();
    let p2Decisions = 0;
    const noteP2 = () => {
      if (game.decision()?.seat === P2) {
        p2Decisions += 1;
      }
    };

    // Sage: no chain ever opened, so there is nothing to close.
    await game.p1.activate("sage");
    noteP2();
    expect(p2Decisions).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });

    // Gate: opened by a played card → P1 priority, then P2's single window, then back to P1's Open State.
    await game.p1.cast("gate", { targets: [...RUNES] });
    noteP2();
    expect(game.decision()).toMatchObject({ context: "chain", seat: P1 });
    await game.p1.passPriority();
    noteP2();
    expect(game.decision()).toMatchObject({ context: "chain", seat: P2 });
    await game.p2.passPriority();
    noteP2();
    expect(p2Decisions).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0); // never a showdown, so no Focus exists to pass
  });
});
