/**
 * Interaction: Ava Achiever (ogn-107-298) · Unit · Mind · 5 · 4 Might
 *     "When I attack, you may pay [mind] to play a card with [Hidden] from your hand, ignoring its
 *      cost. If it's a unit, play it here."
 *   × Mageseeker Warden (ogn-070-298) · Unit · Calm · 6 · 5 Might
 *     "While I'm at a battlefield, opponents can only play units to their base. …"
 *   × Teemo, Scout (ogn-197-298) · Champion Unit · Chaos · 2 · 1 Might · [Hidden]
 *     "When you play me, give me +3 [Might] this turn."
 *   × Hidden Blade (ogn-213-298) · Spell · Order · 2 · [Hidden] [Action]
 *     "Kill a unit at a battlefield. Its controller draws 2."   — the SPELL contrast
 *
 * Question — 419.3.c / 358.3.a for a TRIGGER-driven play from hand with a fixed destination ("play it
 * here"). P1's turn; P1 moves Ava into bf1 defended by P2's 4-Might Sergeant; Ava's attack trigger
 * pends; P1 has exactly 1 [mind].
 *   (a) P2's Warden at bf2; hand = Teemo + Hidden Blade. P1 pays [mind]: which hand cards are
 *       eligible? If Hidden Blade is chosen, is its target restricted to bf1?
 *   (b) Warden at bf2; hand = Teemo ONLY: what is offered, and wherever P1 clicks, where can Teemo
 *       end up?
 *   (c) Warden in P2's BASE; hand = Teemo only: pay → outcome, Teemo's Might and designation?
 *   (d) rollback probe on board (b): raw "play Teemo → bf1" / "→ base" during the showdown.
 *
 * Rules: 403.1.b.1 / 740.4.a.2 / 383.3.b ([mind] is the trigger's base cost, paid at FINALIZATION);
 * 355.10.a (a card chosen from a private zone on resolution is not a target) + 128.6 (may decline);
 * 054.1 (forbid beats permit): "play it here" fixes bf1, the Warden restricts P1's unit plays to
 * base → a Hidden UNIT is not playable by this instruction at all (not re-routed to base — Warden
 * ruling 005f282e…, Grimwyrm/Rift Herald line); 419.3.a (timing comes from the effect), 419.3.c (no
 * eligible card → nothing happens); 811.3 (Hidden Blade is played from HAND, not "from facedown" →
 * 811.1.d.2's "here" restriction does not apply); 358.5; 323.2.a (a unit arriving at a combat
 * battlefield gains Attacker); 466.5.b (nobody left → battlefield becomes Uncontrolled).
 *
 * Expected: (a) eligible = {Hidden Blade} only; Blade costs 0, goes on the chain, may target ANY unit
 * at ANY battlefield; kill Sergeant → P2 draws 2 → Ava alone → conquers. (b) no eligible card; the
 * engine may (i) not offer the pay or (ii) let P1 pay [mind] and then do nothing (419.3.c) — the
 * engine takes (ii). Never: Teemo at bf1/base or a prompt listing Teemo. Combat 4 v 4 → both die →
 * bf1 Uncontrolled (466.5.b). (c) Teemo offered → bf1, exhausted, Attacker, +3 → 4 Might; 8 v 4 →
 * Sergeant dies, P1 conquers. (d) refused, state identical to (b)(ii).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { isHiddenView, P1, P2, scenario } from "../../../harness";

const AVA = "ogn-107-298";
const WARDEN = "ogn-070-298";
const TEEMO = "ogn-197-298";
const HIDDEN_BLADE = "ogn-213-298";

interface BoardOpts {
  wardenAt: "bf2" | "base";
  blade?: boolean;
  mind?: number;
}

/**
 * P1's turn, Neutral Open. bf1: P2's 4-Might Sergeant. bf2: P2's 1-Might Sentry (+ the Warden when
 * `wardenAt` is bf2). P1: Ava in base, `mind` (default 1) power and 0 energy, Teemo in hand
 * (+ Hidden Blade when `blade`).
 */
function board(opts: BoardOpts) {
  const b = scenario()
    .resources(P1, { energy: 0, power: { mind: opts.mind ?? 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", AVA, "ava")
    .unit(P2, "bf1", { might: 4, name: "Sergeant" }, "sarge")
    .unit(P2, "bf2", { might: 1, name: "Sentry" }, "sentry")
    .unit(P2, opts.wardenAt, WARDEN, "warden")
    .hand(P1, TEEMO, "teemo");
  if (opts.blade) {
    b.hand(P1, HIDDEN_BLADE, "blade");
  }
  return b;
}

/** Ava attacks bf1 → her trigger pends with the FIN opt-in up. */
async function attack(opts: BoardOpts): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.move("ava", "bf1");
  expect(game.state("ava").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ava", triggered: true })]);
  return game;
}

/** Pay [mind] at finalization, then both players pass priority so the trigger resolves. */
async function payAndResolve(game: Game): Promise<void> {
  await game.p1.yes();
  expect(game.p1.power("mind")).toBe(0); // 383.3.b — paid at FIN, before anyone had priority
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("Ava Achiever × Mageseeker Warden × Teemo (Hidden unit) / Hidden Blade (Hidden spell)", () => {
  test("premise: the [mind] is the trigger's base cost — asked at FINALIZATION (timing FIN, canAccept) with Ava's item pending, and unpayable with 0 mind (canAccept:false)", async () => {
    const game = await attack({ wardenAt: "bf2" });
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "ava", pendingChoiceType: "opt-in" }, timing: "FIN" });
    const broke = await attack({ mind: 0, wardenAt: "bf2" });
    // DESIGN (DESIGN.md §Paying costs): an unpayable opt-in is still shown, with canAccept:false.
    expect(broke.decision()).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1 });
  });

  // ── (a) Warden at bf2, hand = Teemo + Hidden Blade ───────────────────────────────────

  test("(a) Warden at bf2: after paying [mind] the eligible set on resolution is {Hidden Blade} ONLY — Teemo (a unit that would have to be played HERE) is absent (054.1, 419.3.c); the pick is declinable (128.6)", async () => {
    const game = await attack({ blade: true, wardenAt: "bf2" });
    await payAndResolve(game);
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "from-revealed", source: { cardId: "ava" } });
    expect(d.options.map((o) => o.card)).toEqual(["blade"]);
  });

  test("(a) choosing Hidden Blade: played from HAND ignoring its cost (pool untouched), it goes on the chain as a spell, and its target may be ANY unit at ANY battlefield — bf2's Sentry/Warden included (811.1.d.2 does not apply)", async () => {
    const game = await attack({ blade: true, wardenAt: "bf2" });
    await payAndResolve(game);
    await game.p1.pick("blade");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    const t = game.decision() as PickDecision;
    expect(t).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "blade" } });
    expect(t.options.map((o) => o.card).toSorted()).toEqual(["ava", "sarge", "sentry", "warden"]);
    await game.p1.pick("sarge");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["sarge"], triggered: false, type: "spell" })]);
    expect(game.zoneOf("blade")).toBe("chain");
  });

  test("(a) Blade resolves: Sergeant dies, ITS controller (P2) draws 2, Blade → trash; Ava is alone at bf1 and conquers at combat resolution (+1 point)", async () => {
    const game = await attack({ blade: true, wardenAt: "bf2" });
    await payAndResolve(game);
    await game.p1.pick("blade");
    await game.p1.pick("sarge");
    const p2Hand = game.p2.hand().length;
    const points = game.p1.points();
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.locationOf("ava")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(points + 1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) Warden at bf2, hand = Teemo only ─────────────────────────────────────────────

  test("(b) Warden at bf2, Teemo only: the engine takes path (ii) — the pay IS offered (hand is private), P1 may pay [mind]; on resolution NOTHING happens: no prompt listing Teemo, Teemo stays in hand, [mind] spent and not refunded, focus back with P1 in the showdown (419.3.c)", async () => {
    const game = await attack({ wardenAt: "bf2" });
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no" });
    const hand = game.p1.hand().length;
    await payAndResolve(game);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.cardsAt("battlefield-bf1").toSorted()).toEqual(["ava", "sarge"]);
    expect(game.p1.base()).not.toContain("teemo");
  });

  test("(b) Teemo's identity is never revealed to P2 along the way: P2's view of P1's hand is a redacted card", async () => {
    const game = await attack({ wardenAt: "bf2" });
    await payAndResolve(game);
    const seen = (game.view(P2).zones.hand ?? []).filter((v) => v.owner === P1);
    expect(seen).toHaveLength(1);
    expect(seen.every(isHiddenView)).toBe(true);
    expect(JSON.stringify(game.view(P2))).not.toContain("Teemo");
  });

  test("(b) combat then proceeds Ava 4 vs Sergeant 4 → both die; with no unit left bf1 becomes UNCONTROLLED (466.5.b), no point for anyone", async () => {
    // RULING-CONFLICT: the pairing brief says "bf1 stays P2's (no units → P2 keeps control)"; CR
    // 466.5.b says a combat battlefield with no units remaining becomes Uncontrolled — engine
    // follows CR (FIXER-PRIMER § BATTLEFIELD CONTROL TIMING).
    const game = await attack({ wardenAt: "bf2" });
    await payAndResolve(game);
    const p1Points = game.p1.points();
    const p2Points = game.p2.points();
    await game.settle();
    expect(game.zoneOf("ava")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(p1Points);
    expect(game.p2.points()).toBe(p2Points);
    expect(game.violations()).toEqual([]);
  });

  test("(b) declining instead keeps the [mind] and equally plays nothing", async () => {
    const game = await attack({ wardenAt: "bf2" });
    await game.p1.no();
    expect(game.p1.power("mind")).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  // ── (c) Warden in P2's base ──────────────────────────────────────────────────────────

  test("(c) Warden in P2's BASE imposes nothing: pay [mind] → Teemo IS offered (declinable) → played to bf1 ignoring its cost, enters EXHAUSTED as an ATTACKER, its play trigger pends", async () => {
    const game = await attack({ wardenAt: "base" });
    await payAndResolve(game);
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(d.options.map((o) => o.card)).toEqual(["teemo"]);
    await game.p1.pick("teemo");
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("teemo")).toMatchObject({ combatRole: "attacker", isExhausted: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // 2-cost ignored
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", triggered: true })]);
  });

  test("(c) Teemo's 'when you play me' resolves → 1 + 3 = 4 Might this turn; attackers 4 + 4 = 8 vs 4 → Sergeant dies and P1 conquers bf1 (+1 point)", async () => {
    const game = await attack({ wardenAt: "base" });
    await payAndResolve(game);
    await game.p1.pick("teemo");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("teemo").might).toBe(4);
    expect(game.chain()).toEqual([]);
    const points = game.p1.points();
    await game.settle(); // both pass focus; P2 assigns its 4 damage (default: onto Ava)
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(points + 1);
    const survivors = game.p1.units("bf1");
    expect(survivors.length).toBeGreaterThanOrEqual(1); // one attacker soaked the Sergeant's 4
    expect(survivors.every((u) => u === "ava" || u === "teemo")).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) rollback probes on board (b) ─────────────────────────────────────────────────

  test("(d) on board (b) after the trigger resolved: raw 'pick Teemo', raw playUnit Teemo → bf1 and → base are all REFUSED with the state bit-identical — Teemo in hand, nothing on the chain, bf1 = {Ava attacking, Sergeant defending}, pool {0, mind 0}, Ava's trigger not re-pended, focus with P1 (358.5)", async () => {
    const game = await attack({ wardenAt: "bf2" });
    await payAndResolve(game);
    const hash = game.stateHash();
    const probes: [string, Record<string, unknown>][] = [
      ["resolvePendingChoice", { choice: "teemo" }],
      ["resolvePendingChoice", { picked: ["teemo"] }],
      ["playUnit", { cardId: "teemo", location: "battlefield-bf1", playerId: P1 }],
      ["playUnit", { cardId: "teemo", location: "base", playerId: P1 }],
    ];
    for (const [moveId, params] of probes) {
      const r = await game.p1.try((p) => p.do(moveId, params));
      expect(r.ok).toBe(false);
    }
    expect(game.stateHash()).toBe(hash);
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.chain()).toEqual([]);
    expect(game.cardsAt("battlefield-bf1").toSorted()).toEqual(["ava", "sarge"]);
    expect(game.state("ava").combatRole).toBe("attacker");
    expect(game.state("sarge").combatRole).toBe("defender");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.legal().map((o) => o.key)).not.toContain("playUnit:teemo");
    expect(game.violations()).toEqual([]);
  });
});
