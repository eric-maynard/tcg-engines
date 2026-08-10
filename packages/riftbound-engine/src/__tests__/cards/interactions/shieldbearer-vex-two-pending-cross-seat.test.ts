/**
 * Interaction: Solari Shieldbearer (ogn-051-298) · Unit · Calm · 3 · 2 Might
 *                "When you play me, stun a unit."
 *            × Vex, Apathetic (unl-150-219) · Champion Unit · Chaos · 4 · 4 Might
 *                "[Deflect] When an opponent plays a unit while I'm at a battlefield, [Stun] it. They can't
 *                 move it this turn."
 *
 * Question: P1's turn, Open state. P2's Vex is at bf1 with a plain unit Y. P1 plays Shieldbearer to base.
 * The unit resolves immediately (337.2); now TWO triggers are pending at once with different controllers —
 * Shieldbearer's play trigger (P1, needs a target) and Vex's trigger (P2, "it" is determined).
 *   (a) Order appended/finalized; is P1 prompted for the stun target BEFORE Vex's item is finalized and
 *       BEFORE any priority window; is there a priority window between the two finalizations?
 *   (b) Once both are finalized, who holds priority first and what is the listing?
 *   (c) Resolution order and end state (P1 targets Y).
 *   (d) Variant: P1 targets Vex herself — when is the Deflect [rainbow] paid?
 *   (e) Control: Vex in P2's base — how many items, who has priority?
 *
 * Rules: 337.2 (a unit finalizes and resolves at once, enters exhausted), 330 (chain persists while items
 * exist), 419.4.a + 383.4.a.2 (both triggers trigger off the completed play), 383.3.d.1 (different
 * controllers → turn order: P1's item appended first/older, P2's second/newer), 337.1 / 337.1.b (oldest
 * pending finalized first — P1 picks the stun target now, 355.5), 337.1.a (no priority passes while
 * finalizing), 337.3 (then P2's Vex item finalizes), 337.4 (controller of the newest item — P2 — gets
 * priority first), 340.1 (newest resolves first: Vex's), 340.4 (then priority to the controller of the
 * remaining newest item — P1), 340.2 / 335 (chain empty → turn player's Open state), Deflect 809 (an
 * additional cost to CHOOSE Vex, paid when the choice is made — at finalization), 383.2.a.1 ("while I'm at
 * a battlefield" is part of Vex's condition).
 *
 * Expected: (a) prompt for P1's target comes first, no priority in between; (b) [1 Shieldbearer trigger
 * (P1→Y), 2 Vex trigger (P2→Shieldbearer)], priority P2; (c) P2 pass, P1 pass → Shieldbearer Stunned +
 * can't move; priority P1; P1 pass, P2 pass → Y Stunned; Open, P1 acts; (d) [rainbow] leaves P1's pool at
 * the pick, before P2 ever holds priority; without [rainbow] Vex is not offered; (e) one item, P1 first.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHIELDBEARER = "ogn-051-298";
const VEX_APATHETIC = "unl-150-219";

/** P1's turn 2. bf1 is P2's: Vex (or Vex in base for the control) + Yeoman Y (2). P1: Shieldbearer, 3 energy, 1 rainbow. */
function board(vexAt: "bf1" | "base" = "bf1", rainbow = 1) {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, vexAt, VEX_APATHETIC, "vex")
    .unit(P2, "bf1", { might: 2, name: "Yeoman Y" }, "Y")
    .hand(P1, SHIELDBEARER, "sb");
}

const listing = (game: Game) => game.chain().map((c) => [c.cardId, c.controller, c.triggered, c.targets ?? []]);
const isChainPriority = (d: Decision | null, seat?: string) =>
  d?.kind === "action" && d.context === "chain" && (seat === undefined || d.seat === seat);
const noMove = { duration: "turn", keyword: "NoMove" };

/** Play Shieldbearer to base and answer its target prompt with `target`; stops at the first priority window. */
async function playedAndTargeted(target: "Y" | "vex" | "sb", b = board()): Promise<Game> {
  const game = await b.build();
  await game.p1.play("sb", { to: "base" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick(target);
  return game;
}

describe("Solari Shieldbearer into Vex, Apathetic — two pending triggers, two controllers, on P1's turn", () => {
  // ---------------------------------------------------------------- (a) finalize order, prompt before priority

  test("(a) the unit itself finalizes and resolves immediately: 3 energy paid, Shieldbearer is in P1's base, exhausted, before anything else is asked (337.2)", async () => {
    const game = await board().build();
    await game.p1.play("sb", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.zoneOf("sb")).toBe("base");
    expect(game.state("sb")).toMatchObject({ controller: P1, isExhausted: true, location: "base" });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  });

  test("(a) the very next decision is P1's stun-target PICK — no priority window first; both triggers are already on the chain, P1's (turn player) appended below P2's Vex item (383.3.d.1, 337.1, 355.5)", async () => {
    const game = await board().build();
    await game.p1.play("sb", { to: "base" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1, source: { cardId: "sb" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["Y", "sb", "vex"]); // "a unit": any
    // oldest → newest
    expect(listing(game)).toEqual([
      ["sb", P1, true, []],
      ["vex", P2, true, []],
    ]);
    expect(game.state("sb").isStunned).toBe(false); // nothing resolved yet
  });

  test("(a) Vex's item never asks anyone anything ('it' is determined, not chosen): after P1's pick the engine goes straight to a priority window — no P2 prompt, no order prompt (337.3, 337.1.a)", async () => {
    const game = await playedAndTargeted("Y");
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(isChainPriority(d)).toBe(true);
    expect(listing(game)).toEqual([
      ["sb", P1, true, ["Y"]],
      ["vex", P2, true, []],
    ]);
  });

  // ---------------------------------------------------------------- (b) who holds priority first

  test("(b) with both finalized, the controller of the NEWEST item — P2 — holds priority first, on P1's turn (337.4)", async () => {
    const game = await playedAndTargeted("Y");
    expect(game.turnPlayer()).toBe(P1);
    expect(isChainPriority(game.decision(), P2)).toBe(true);
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.legal()).toEqual([]); // P1 has nothing to do until P2 acts or passes
  });

  // ---------------------------------------------------------------- (c) resolution order and end state

  test("(c) P2 pass, P1 pass → Vex's item (newest) resolves first: Shieldbearer is Stunned with 'can't move this turn'; Y untouched; Shieldbearer's item still waits (340.1)", async () => {
    const game = await playedAndTargeted("Y");
    await game.p2.passPriority();
    expect(isChainPriority(game.decision(), P1)).toBe(true);
    await game.p1.passPriority();
    expect(game.state("sb").isStunned).toBe(true);
    expect(game.state("sb").grantedKeywords).toEqual([expect.objectContaining(noMove)]);
    expect(game.state("Y").isStunned).toBe(false);
    expect(listing(game)).toEqual([["sb", P1, true, ["Y"]]]);
  });

  test("(c) after Vex's item resolved, priority goes to the controller of the remaining newest item — P1 (340.4); P1 pass, P2 pass → Y is Stunned, chain empty", async () => {
    const game = await playedAndTargeted("Y");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(isChainPriority(game.decision(), P1)).toBe(true);
    await game.p1.passPriority();
    expect(isChainPriority(game.decision(), P2)).toBe(true);
    expect(game.state("Y").isStunned).toBe(false);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("Y").isStunned).toBe(true);
  });

  test("(c) end state: Open state on P1's turn with P1 acting (340.2 / 335); Shieldbearer stunned + locked, Y stunned, Vex untouched, [rainbow] never spent", async () => {
    const game = await playedAndTargeted("Y");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("sb")).toMatchObject({ isExhausted: true, isStunned: true, location: "base" });
    expect(game.state("sb").grantedKeywords).toEqual([expect.objectContaining(noMove)]);
    expect(game.state("Y").isStunned).toBe(true);
    expect(game.state("vex").isStunned).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.violations()).toEqual([]);
  });

  // ---------------------------------------------------------------- (d) targeting Vex: Deflect paid at finalization

  test("(d) Vex is offered as a target only because P1 can afford Deflect; picking her spends the [rainbow] AT THE PICK — before P2's first priority window, long before resolution (809, 337.1)", async () => {
    const game = await board().build();
    await game.p1.play("sb", { to: "base" });
    expect(game.p1.power("rainbow")).toBe(1);
    await game.p1.pick("vex");
    // First priority window (P2's) — the cost is already gone, nothing has resolved.
    expect(isChainPriority(game.decision(), P2)).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.state("vex").isStunned).toBe(false);
    expect(listing(game)).toEqual([
      ["sb", P1, true, ["vex"]],
      ["vex", P2, true, []],
    ]);
    await game.settle();
    expect(game.state("vex").isStunned).toBe(true);
    expect(game.state("sb").isStunned).toBe(true);
    expect(game.state("Y").isStunned).toBe(false);
    expect(game.p1.power("rainbow")).toBe(0); // paid exactly once
  });

  test("(d) without a [rainbow] to pay Deflect, Vex is simply not among the offered targets (Y and Shieldbearer itself still are)", async () => {
    const game = await board("bf1", 0).build();
    await game.p1.play("sb", { to: "base" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["Y", "sb"]);
    expect((await game.p1.try((p) => p.pick("vex"))).ok).toBe(false);
  });

  // ---------------------------------------------------------------- (e) control: Vex in base

  test("(e) control — Vex in P2's BASE: 'while I'm at a battlefield' fails (383.2.a.1) → only Shieldbearer's trigger; P1 picks Y, then P1 (its controller) holds priority first (337.4)", async () => {
    const game = await board("base").build();
    await game.p1.play("sb", { to: "base" });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "sb" } });
    expect(listing(game)).toEqual([["sb", P1, true, []]]);
    await game.p1.pick("Y");
    expect(listing(game)).toEqual([["sb", P1, true, ["Y"]]]);
    expect(isChainPriority(game.decision(), P1)).toBe(true);
    await game.p1.passPriority();
    expect(isChainPriority(game.decision(), P2)).toBe(true);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("Y").isStunned).toBe(true);
    expect(game.state("sb").isStunned).toBe(false);
    expect(game.state("sb").grantedKeywords).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
