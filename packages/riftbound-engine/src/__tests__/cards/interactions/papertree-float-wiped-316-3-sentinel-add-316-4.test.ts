/**
 * Interaction: The Papertree (sfd-219-221, Battlefield)
 *     "When you hold here, each player channels 1 rune exhausted."
 *   × Blue Sentinel (unl-087-219, Unit · Mind · 4 Might)
 *     "[Shield 2] … Your hold effects for holding here trigger an additional time.
 *      When I hold, [Add] [rainbow] at the start of your next Main Phase."
 *   × Mind Rune (ogn-089-298) — P1's two ready basic runes on board.
 *
 * Question: P2 ends turn 2 → P1's turn 3. P1 controls the Papertree with Blue Sentinel on it; P1 has
 * 2 ready Mind Runes, P2 2 ready runes, both pools (0,{}). P1 holds the Papertree in its Beginning
 * Phase. (a) Which hold items appear on the chain, who gets priority, may P1 tap 2 (→2E) and P2 tap 1
 * (→1E) in that window? (b) Trace pools/runes through both Papertree resolutions, the Channel Phase
 * and the Draw Phase. (c) At the transition into the Main Phase, does 316.3 (every pool empties) run
 * before 316.4 (start-of-Main-Phase effects) — i.e. does P1 open at (0,{rainbow:2}) and is P2's
 * float gone too? (d) NO side: Sentinel in P1's base instead — one Papertree trigger, no rainbow.
 *
 * Rules: 315.2.b.2 (the turn player Holds), 471.2.b / 383.4.d (hold effects trigger at the held
 * battlefield → chain items), 429.2 / 429.2.a (an [Add] ability finalizes + resolves at once, no
 * chain item, no priority), 430.2 (channel … exhausted), 166.2 (channeling adds nothing to a pool),
 * 316.2 → 316.3 ("EACH player's Rune Pool empties") → 316.4 (start-of-Main-Phase effects), 167.
 *
 * Observability note: once the last Beginning-Phase item resolves the flow runs Channel → Draw →
 * Main in one step, so "pools after the Draw Phase" cannot be sampled on its own; the test samples
 * (i) after Papertree #1 (still in the Beginning Phase) and (ii) at the Main Phase's Neutral Open,
 * which together pin the 316.3-before-316.4 order: energy floated in the window is GONE while the
 * delayed rainbow is PRESENT.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const THE_PAPERTREE = "sfd-219-221";
const BLUE_SENTINEL = "unl-087-219";
const MIND_RUNE = "ogn-089-298";

type Built = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P2 about to end turn 2. bf1 = a LIVE Papertree controlled by P1 with Blue Sentinel standing on it
 * (`sentinelAt` = "bf1"), or with a vanilla 2-Might Sentry on it and the Sentinel in P1's base
 * (`sentinelAt` = "base"). P1: 2 ready Mind Runes (m1, m2); P2: 2 ready runes (r1, r2); pools empty;
 * 12-rune decks behind each.
 */
function board(sentinelAt: "bf1" | "base") {
  const s = scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1, def: THE_PAPERTREE, inert: false, owner: P1 })
    .rune(P1, MIND_RUNE, { alias: "m1" })
    .rune(P1, MIND_RUNE, { alias: "m2" })
    .rune(P2, "fury", { alias: "r1" })
    .rune(P2, "fury", { alias: "r2" });
  return sentinelAt === "bf1"
    ? s.unit(P1, "bf1", BLUE_SENTINEL, "sentinel")
    : s.unit(P1, "bf1", { might: 2, name: "Sentry" }, "sentry").unit(P1, "base", BLUE_SENTINEL, "sentinel");
}

const pools = (game: Built) => ({ p1: game.p1.resources(), p2: game.p2.resources() });
const runeCounts = (game: Built) => ({
  p1: { ready: game.p1.runes({ ready: true }).length, total: game.p1.runes().length },
  p2: { ready: game.p2.runes({ ready: true }).length, total: game.p2.runes().length },
});

describe("Papertree hold ×2 (Blue Sentinel): Beginning-Phase float wiped at 316.3, delayed [Add] lands at 316.4", () => {
  // ─── (a) what goes on the chain, who gets priority, tapping in the window ──────────────────
  test("(a) P2 ends turn → P1 holds the Papertree (+1 point): TWO Papertree items controlled by P1 wait on the chain (doubled by the Sentinel), the Sentinel's own 'When I hold' [Add] is NOT a chain item (429.2), and P1 — then P2 — hold priority", async () => {
    const game = await board("bf1").build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(3);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1); // the hold point itself is never doubled
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "bf1", controller: P1, name: "The Papertree", triggered: true }),
      expect.objectContaining({ cardId: "bf1", controller: P1, name: "The Papertree", triggered: true }),
    ]);
    expect(game.chain().some((i) => i.cardId === "sentinel")).toBe(false);
    expect(pools(game)).toEqual({ p1: { energy: 0, power: {} }, p2: { energy: 0, power: {} } }); // nothing added at hold time
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("(a) in that Beginning-Phase window both players may activate their basic runes' Reaction [Add]: P1 taps m1+m2 → (2,{}), P2 taps r1 → (1,{}); the taps add no chain items", async () => {
    const game = await board("bf1").build();
    await game.p2.endTurn();
    expect(game.p1.can("tapRune", "m1")).toBe(true);
    await game.p1.tapRune("m1");
    await game.p1.tapRune("m2");
    expect(game.p1.resources()).toEqual({ energy: 2, power: {} });
    expect(game.chain()).toHaveLength(2); // still just the two Papertree items
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // 429.2.a — priority did not move
    await game.p1.passPriority();
    expect(game.p2.can("tapRune", "r1")).toBe(true);
    await game.p2.tapRune("r1");
    expect(game.p2.resources()).toEqual({ energy: 1, power: {} });
    expect(game.chain()).toHaveLength(2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  // ─── (b) trace through both resolutions ────────────────────────────────────────────────────
  test("(b) Papertree #1 resolves: EACH player channels the top rune of their deck EXHAUSTED (430.2) — P1 3 runes/0 ready, P2 3 runes/1 ready — and the pools are untouched at (2,{}) / (1,{}) (166.2: channeling adds nothing); the second item still waits and priority comes round again", async () => {
    const game = await board("bf1").build();
    await game.p2.endTurn();
    await game.p1.tapRune("m1");
    await game.p1.tapRune("m2");
    await game.p1.passPriority();
    await game.p2.tapRune("r1");
    const p1Deck = game.p1.runeDeck().length;
    const p2Deck = game.p2.runeDeck().length;
    await game.p2.passPriority(); // both passed → the top Papertree item resolves
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", controller: P1, triggered: true })]);
    expect(runeCounts(game)).toEqual({ p1: { ready: 0, total: 3 }, p2: { ready: 1, total: 3 } });
    expect(game.p1.runeDeck()).toHaveLength(p1Deck - 1);
    expect(game.p2.runeDeck()).toHaveLength(p2Deck - 1);
    expect(pools(game)).toEqual({ p1: { energy: 2, power: {} }, p2: { energy: 1, power: {} } });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  // ─── (c) 316.3 before 316.4 ────────────────────────────────────────────────────────────────
  test("(c) Papertree #2 resolves, then Channel (P1 +2 ready) and Draw (P1 +1 card) run into the Main Phase: FIRST every pool empties (316.3 — P1's 2E AND P2's 1E, on P1's turn), THEN the two delayed Sentinel Adds land (316.4) → P1 opens its Neutral Open at (0,{rainbow:2}), P2 at (0,{}); P1 has 6 runes (2 ready + 4 exhausted), P2 4 (1 ready)", async () => {
    const game = await board("bf1").build();
    const p1Hand = game.p1.hand().length;
    await game.p2.endTurn();
    await game.p1.tapRune("m1");
    await game.p1.tapRune("m2");
    await game.p1.passPriority();
    await game.p2.tapRune("r1");
    await game.p2.passPriority(); // #1 resolves
    await game.p1.passPriority();
    await game.p2.passPriority(); // #2 resolves → 315.3 Channel → 315.4 Draw → 316 Main
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // 316.3 wiped the Beginning-Phase float of BOTH players; 316.4 then added the two rainbow.
    expect(pools(game)).toEqual({ p1: { energy: 0, power: { rainbow: 2 } }, p2: { energy: 0, power: {} } });
    // Not (2E, 2 rainbow) and not (0,{}):
    expect(game.p1.energy()).not.toBe(2);
    expect(game.p1.power("rainbow")).toBe(2);
    // Runes: P1 = m1,m2 (tapped, stay exhausted — Awaken already happened) + 2 Papertree (exhausted) + 2 Channel (ready).
    expect(runeCounts(game)).toEqual({ p1: { ready: 2, total: 6 }, p2: { ready: 1, total: 4 } });
    expect(game.state("m1").isExhausted).toBe(true);
    expect(game.state("m2").isExhausted).toBe(true);
    expect(game.state("r1").isExhausted).toBe(true);
    expect(game.state("r2").isReady).toBe(true);
    expect(game.p1.hand()).toHaveLength(p1Hand + 1); // Draw Phase
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("(c) same transition WITHOUT anyone tapping in the window: P1 opens at (0,{rainbow:2}) with 4 ready + 2 exhausted runes; P2 (0,{}) with 2 ready + 2 exhausted", async () => {
    const game = await board("bf1").build();
    await game.advanceTurn(); // P2 ends; everyone passes; into P1's Main Phase
    expect(game.phase()).toBe("main");
    expect(pools(game)).toEqual({ p1: { energy: 0, power: { rainbow: 2 } }, p2: { energy: 0, power: {} } });
    expect(runeCounts(game)).toEqual({ p1: { ready: 4, total: 6 }, p2: { ready: 2, total: 4 } });
    // The rainbow is real, spendable Main-Phase power: it survives P1 acting (tap a rune) …
    await game.p1.tapRune();
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 2 } });
    // … and is lost only at the end of P1's turn (317.2 empty-pools), together with the energy.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  // ─── (d) NO side: Sentinel in base ─────────────────────────────────────────────────────────
  test("(d) Blue Sentinel in P1's BASE (a plain Sentry holds the Papertree): exactly ONE Papertree item, each player channels 1 exhausted once, no delayed Add — P1 opens its Main Phase at (0,{}) and the 1E P1 floated in the window is wiped all the same", async () => {
    const game = await board("base").build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", controller: P1, name: "The Papertree", triggered: true })]);
    await game.p1.tapRune("m1");
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    await game.p1.passPriority();
    await game.p2.tapRune("r1");
    expect(game.p2.resources()).toEqual({ energy: 1, power: {} });
    await game.p2.passPriority(); // the single item resolves → Channel → Draw → Main
    expect(game.phase()).toBe("main");
    expect(game.chain()).toEqual([]);
    expect(pools(game)).toEqual({ p1: { energy: 0, power: {} }, p2: { energy: 0, power: {} } });
    // P1: m1 (tapped) + m2 (ready) + 1 Papertree (exhausted) + 2 Channel (ready) = 5 runes, 3 ready. P2: 3 runes, 1 ready.
    expect(runeCounts(game)).toEqual({ p1: { ready: 3, total: 5 }, p2: { ready: 1, total: 3 } });
    expect(game.violations()).toEqual([]);
  });

  test("(d) contrast in one line: Sentinel on the Papertree → 2 items / +2 runes each / 2 rainbow; Sentinel in base → 1 item / +1 rune each / no rainbow", async () => {
    const on = await board("bf1").build();
    await on.p2.endTurn();
    expect(on.chain().filter((i) => i.cardId === "bf1")).toHaveLength(2);
    await on.settle();
    expect(on.p1.runes()).toHaveLength(6);
    expect(on.p2.runes()).toHaveLength(4);
    expect(on.p1.power("rainbow")).toBe(2);

    const off = await board("base").build();
    await off.p2.endTurn();
    expect(off.chain().filter((i) => i.cardId === "bf1")).toHaveLength(1);
    await off.settle();
    expect(off.p1.runes()).toHaveLength(5);
    expect(off.p2.runes()).toHaveLength(3);
    expect(off.p1.power("rainbow")).toBe(0);
    expect(off.p1.power()).toBe(0);
  });
});
