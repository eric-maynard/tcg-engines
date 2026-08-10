/**
 * Interaction: Seal of Focus (ogn-081-298) · Gear · Calm · 0
 *     "[Exhaust]: [Reaction] — [Add] [calm]. (Abilities that add resources can't be reacted to.)"
 *   × Defy (ogn-045-298) · Spell · Calm · 1+[calm]
 *     "[Reaction] Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Hextech Ray (ogn-009-298) · Spell · Fury · 1+[fury]
 *     "[Action] Deal 3 to a unit at a battlefield."
 *
 * Question: P1's turn. P2 controls a ready Seal of Focus, holds Defy and has exactly 1 energy and NO calm.
 * P1 plays Hextech Ray at P2's 3-Might unit X and (holding priority first) passes. P2, now with priority,
 * exhausts Seal of Focus and then plays Defy targeting Hextech Ray.
 *   (a) Does the Seal activation ever appear in the chain listing, does it hand priority to P1 or open any
 *       response window, and can P1 do anything between the Seal activation and Defy being finalized?
 *   (b) Could P2 equally have started playing Defy first and tapped the Seal during Defy's Pay Costs step?
 *   (c) The rest: listing/priority after Defy finalizes, and outcome.
 *   (d) Control: P2 has no Seal / no calm — Defy is not a legal play and Hextech Ray kills X after P2 passes.
 *
 * Rules: 337.2 + 429.3.a (an ability that Adds resources resolves immediately on finalizing), 337.1.a
 * (finalizing does not pass priority), 429.3 / 357.1.a (Reaction Add abilities may be activated during Pay
 * Costs), 337.4 (after finalizing, the controller of the newest item has priority), 339.1 / 340.1 (all pass →
 * newest resolves), 425.1.a (a countered card does nothing, is cleared from the chain to trash), 340.2 / 335
 * (empty chain → Open State, turn player gets priority), 355.8 (unpayable/invalid play cannot be put on the
 * chain).
 *
 * Expected: (a) the Seal's Add finalizes and resolves at once: P2's pool gains [calm]; the listing at every
 * priority window is just [Hextech Ray] until Defy is added; P2 keeps priority; P1 has no window in between.
 * (b) Yes by the rules (357.1.a) — either sequencing yields the same chain. ENGINE: deliberately not modelled
 * (DESIGN.md §Paying costs — paying is manual, a play is only offered when the CURRENT pool covers it), so Defy
 * is not listed until the Seal has actually been used → recorded as a failing rules assertion below.
 * (c) [Hextech Ray (P1→X), Defy (P2→Hextech Ray)], priority P2; P2 pass → P1 pass → Defy resolves: Hextech Ray
 * countered → P1's trash, Defy → trash, chain empty → P1's Open main phase; X undamaged.
 * (d) Without the calm Defy is not playable; P2 passes → Hextech Ray resolves, 3 to X (3 Might) → X dies.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SEAL_OF_FOCUS = "ogn-081-298";
const DEFY = "ogn-045-298";
const HEXTECH_RAY = "ogn-009-298";

/**
 * P1's turn. P1: Hextech Ray + exactly 1 energy + 1 fury. P2: unit X (3 Might) at P2's bf1, Defy in hand,
 * exactly 1 energy, NO calm; `withSeal` adds a ready Seal of Focus to P2's base.
 */
function board(withSeal = true) {
  const b = scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Unit X" }, "x")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P2, DEFY, "defy");
  return withSeal ? b.gear(P2, SEAL_OF_FOCUS, "seal") : b;
}

/** P1 casts Hextech Ray at X and passes; P2 now holds priority over [Hextech Ray]. */
async function rayOnChainP2HasPriority(withSeal = true): Promise<Game> {
  const game = await board(withSeal).build();
  await game.p1.cast("ray", { targets: "x" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P1, targets: ["x"] })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // caster holds priority first
  expect(game.p2.legal()).toEqual([]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Seal of Focus [Add] is silent and immediate → Defy counters Hextech Ray", () => {
  // ── (a) the Seal activation ─────────────────────────────────────────────────────────────────────────

  test("(a) before the Seal: P2 (1 energy, no calm) is offered the Seal activation but NOT Defy — its [calm] is unpayable from the pool (355.8)", async () => {
    const game = await rayOnChainP2HasPriority();
    expect(game.p2.resources()).toEqual({ energy: 1, power: {} });
    expect(game.p2.can("activate", "seal")).toBe(true);
    expect(game.p2.can("cast", "defy")).toBe(false);
  });

  test("(a) exhausting the Seal: the Add finalizes and resolves IMMEDIATELY — [calm] is in P2's pool, the Seal is exhausted, and the chain listing is still just [Hextech Ray]; no Seal item ever lingers (337.2, 429.3.a)", async () => {
    const game = await rayOnChainP2HasPriority();
    await game.p2.activate("seal");
    expect(game.state("seal").isExhausted).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ray"]);
    expect(game.chain().some((i) => i.cardId === "seal")).toBe(false);
  });

  test("(a) the Seal does not hand priority to P1 or open any window: P2 STILL holds priority over Hextech Ray, P1 has no legal action, and Defy is now listed for P2 (337.1.a, 'can't be reacted to')", async () => {
    const game = await rayOnChainP2HasPriority();
    await game.p2.activate("seal");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2, source: { cardId: "ray" } });
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.legal()).toEqual([]);
    expect(game.p2.can("cast", "defy")).toBe(true);
    const field = game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets");
    const targets = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(targets).toEqual(["ray"]); // Hextech Ray: cost 1 ≤ 4 and one power pip ≤ [rainbow]
  });

  // ── (b) Defy first, Seal during Pay Costs ───────────────────────────────────────────────────────────

  // DESIGN: rules 357.1.a / 429.3 do let a player activate a Reaction [Add] ability *inside* a card's Pay
  // Costs step, so at the table a ready Seal of Focus already makes Defy castable. The engine deliberately
  // models paying as a manual, player-driven act (DESIGN.md §Paying costs): a play is offered only when the
  // CURRENT pool covers its cost, and no Add source is auto-tapped on the player's behalf. The two lines are
  // strategically equivalent — the player simply activates the Seal first, in the same priority window, with
  // no pass in between (see the engine-line facet below) — so this is a deliberate interface difference, not
  // a rules error. Auto-activating Add sources during Pay Costs is a capability the engine does not have.
  test("DESIGN: with the Seal still READY, Defy is not yet offered — the engine never auto-taps an Add source inside Pay Costs (357.1.a, 429.3 vs DESIGN.md §Paying costs)", async () => {
    const game = await rayOnChainP2HasPriority();
    expect(game.state("seal").isReady).toBe(true);
    expect(game.p2.can("cast", "defy")).toBe(false);
    const refused = await game.p2.try((p) => p.cast("defy", { targets: "ray" }));
    expect(refused.ok).toBe(false);
    expect(game.state("seal").isReady).toBe(true);
    expect(game.chain().map((i) => i.cardId)).toEqual(["ray"]);
    // …and the equivalent legal line: tap the Seal first, then Defy, without ever giving up priority.
    await game.p2.activate("seal");
    await game.p2.cast("defy", { targets: "ray" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ray", "defy"]);
    expect(game.state("seal").isExhausted).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("(b) engine line: attempting Defy before tapping the Seal is refused and changes nothing; Seal-then-Defy inside the SAME priority window (no pass in between) produces exactly the chain the rules describe", async () => {
    const game = await rayOnChainP2HasPriority();
    const early = await game.p2.try((p) => p.cast("defy", { targets: "ray" }));
    expect(early.ok).toBe(false);
    expect(game.zoneOf("defy")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 1, power: {} });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ray"]);
    await game.p2.activate("seal");
    await game.p2.cast("defy", { targets: "ray" });
    expect(game.chain().map((i) => [i.cardId, i.controller, i.targets])).toEqual([
      ["ray", P1, ["x"]],
      ["defy", P2, ["ray"]],
    ]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  // ── (c) after Defy finalizes ────────────────────────────────────────────────────────────────────────

  test("(c) Defy finalizes and lingers: listing [1 Hextech Ray (P1→X), 2 Defy (P2→Hextech Ray)], P2 paid 1+[calm], and P2 — controller of the newest item — holds priority (337.4)", async () => {
    const game = await rayOnChainP2HasPriority();
    await game.p2.activate("seal");
    await game.p2.cast("defy", { targets: "ray" });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "ray", controller: P1, countered: false, targets: ["x"], triggered: false }),
      expect.objectContaining({ cardId: "defy", controller: P2, countered: false, targets: ["ray"], triggered: false }),
    ]);
    expect(game.zoneOf("defy")).toBe("chain");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2, source: { cardId: "defy" } });
  });

  test("(c) P2 passes → P1 has priority over Defy (may respond, here passes) → Defy resolves: Hextech Ray is countered, does nothing and goes to P1's trash; Defy to P2's trash; chain empty (339.1, 340.1, 425.1.a)", async () => {
    const game = await rayOnChainP2HasPriority();
    await game.p2.activate("seal");
    await game.p2.cast("defy", { targets: "ray" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1, source: { cardId: "defy" } });
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.p1.trash()).toContain("ray");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p2.trash()).toContain("defy");
    expect(game.state("x").damage).toBe(0);
    expect(game.zoneOf("x")).toBe("battlefield-bf1");
  });

  test("(c) with the chain empty play proceeds in an Open State and the TURN PLAYER (P1) regains priority — P2 has nothing to do on P1's turn (340.2, 335)", async () => {
    const game = await rayOnChainP2HasPriority();
    await game.p2.activate("seal");
    await game.p2.cast("defy", { targets: "ray" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p2.legal()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // Ray's cost stays paid although countered
    expect(game.violations()).toEqual([]);
  });

  // ── (d) control: no Seal, no calm ───────────────────────────────────────────────────────────────────

  test("(d) control — no Seal, no calm: Defy is not a legal play for P2 (cost unpayable → cannot be finalized, 355.8); the attempt is refused and nothing changes", async () => {
    const game = await rayOnChainP2HasPriority(false);
    expect(game.p2.can("cast", "defy")).toBe(false);
    expect(game.p2.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
    const r = await game.p2.try((p) => p.cast("defy", { targets: "ray" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("defy")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 1, power: {} });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ray"]);
  });

  test("(d) control — P2 passes; both have now passed in sequence → Hextech Ray resolves: 3 to X (3 Might) → X dies to P2's trash; back to P1's Open main phase", async () => {
    const game = await rayOnChainP2HasPriority(false);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.p2.trash()).toContain("x");
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("hand");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
