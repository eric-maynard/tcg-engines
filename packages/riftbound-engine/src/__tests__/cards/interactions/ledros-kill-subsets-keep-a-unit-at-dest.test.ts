/**
 * Interaction: Commander Ledros (ogn-231-298) · Unit · Order · 6 + [order]×4 · 8 Might
 *     "As you play me, you may kill any number of friendly units as an additional cost. Reduce my cost by [order]
 *      for each killed this way. [Deflect] [Ganking]"
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 · 4 Might (vanilla) — S1 (2 damage, exhausted) and S2 hold bf1
 *   × Recruit (ogn-272-298) · Unit token · 1 Might — R, in P1's base
 *
 * Question — 355.16 offered-set combinatorics + 358.3 / 358.5. P1's turn, Neutral Open. P1 controls bf1 with S1 + S2 and
 * has R in base; nothing else friendly.
 *   (a) 6 energy + exactly 2 [order]: which (destination × kill-set) combinations are offered?
 *   (b) same pool but NO Recruit: which destinations are offered at all? Play it: end state / bf1 control?
 *   (c) 6 energy + 4 [order] (full price affordable): which kill-sets for destination bf1 vs base? cost per set?
 *   (d) rollback probe on board (a): raw {Ledros → bf1, kill [S1, S2]} — state afterwards?
 *
 * Rules: 355.1 / 355.1.a (kill choices are "as you play me" choices, step 2), 355.2.a (valid locations = base or a
 * controlled battlefield), 355.16 / 357.3 (no choice / payment that deterministically leads to an illegal outcome), 356.2.b.1
 * (optional additional cost), 356.4 (one [order] waived per kill), 357.2 (kills are PAID in step 4), 358.2 (all costs paid),
 * 358.3 (Check Legality) / 358.5 (failure ⇒ everything undone), 323.6 (control of an emptied battlefield lapses at an
 * Open-state Cleanup), 337.2 (a permanent resolves right after finalizing — no priority window).
 *
 * Rulings — CONFLICT on "kill every friendly unit at the battlefield you play him TO": Ledros 730775fe + Cruel Patron
 * 7e1f5339… / db8a04e8… / 81bdefc5… (pre-Unleashed) say ILLEGAL; Ledros cdc183fe and the official Unleashed clarification
 * 9a32c2cc829f221a ("abilities that kill units as a cost in order to play another unit will be able to kill units at
 * battlefields and then play the resulting unit to that same battlefield" — 187.4.c / 190.4 / 323.6: control cannot be
 * lost while the play is on the chain) say LEGAL. RULING-CONFLICT: the engine follows the CR + the official clarification
 * (operations/battlefield-control.ts, FIXER-PRIMER § BATTLEFIELD CONTROL TIMING, rulings/cruel-patron-9a32c2cc829f221a,
 * stalking-wolf-lone-poro-ambush-rollback (d)): a kill-set that empties the CONTROLLED destination is a legal line — the
 * location is still Valid at Check Legality (358.3), so 355.16 has nothing to forbid. (An [Ambush] REACTION play is
 * different: 822.3 voids the granted Reaction once the cost leaves no friendly unit there — see the Stalking Wolf tests.)
 *
 * Expected:
 *   (a) offered: base × {S1S2, S1R, S2R, S1S2R}; bf1 × the same four; no kill-set of size < 2 anywhere (2 [order] can't
 *       pay 3+ pips, 358.2). bf1/{S2,R}: S2 → trash, R ceases to exist, pay 6 + [order][order], Ledros enters bf1
 *       exhausted beside S1, P1 keeps bf1, no chain / no P2 window.
 *   (b) only {S1,S2} makes it payable; offered = {base, bf1} × {S1S2}. Play to base: both Sergeants in trash, Ledros in
 *       base, bf1 uncontrolled after the next Open-state Cleanup (323.6).
 *   (c) base × every subset of {S1,S2,R} incl. ∅; bf1 × every subset too; cost = 6 + (4 − |kills|) [order].
 *   (d) raw {bf1, kill S1+S2}: legal — S1 + S2 in trash, 6 + [order]×2 paid, Ledros ALONE at bf1, bf1 still P1's (he holds
 *       it), never a partial rollback.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LEDROS = "ogn-231-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const RECRUIT = "ogn-272-298";

function board(opts: { order: number; recruit?: boolean }) {
  let s = scenario()
    .resources(P1, { energy: 6, power: { order: opts.order } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "Enemy Holder" }, "enemy") // never a "friendly" kill candidate
    .unit(P1, "bf1", VANGUARD_SERGEANT, "s1", { damage: 2, exhausted: true })
    .unit(P1, "bf1", VANGUARD_SERGEANT, "s2")
    .hand(P1, LEDROS, "ledros");
  if (opts.recruit !== false) {
    s = s.unit(P1, "base", RECRUIT, "r");
  }
  return s;
}

const bf = (loc: unknown): string => String(loc).replace(/^battlefield-/, "");

/** Every (destination, kill-set) line the engine offers P1 for playing Ledros right now; kill-set = sorted ids joined by "+" ("" = no kill). */
function lines(game: Game): string[] {
  const opt = game.p1.option("play", "ledros");
  const out = (opt?.variants ?? []).map((v) => {
    const p = v.params as { location?: unknown; sacrificeIds?: readonly string[]; sacrificeId?: string };
    const kills = [...(p.sacrificeIds ?? (p.sacrificeId ? [p.sacrificeId] : []))].sort().join("+");
    return `${bf(p.location)}/${kills || "∅"}`;
  });
  return [...new Set(out)].sort();
}

const linesAt = (game: Game, dest: "base" | "bf1"): string[] =>
  lines(game)
    .filter((l) => l.startsWith(`${dest}/`))
    .map((l) => l.slice(dest.length + 1))
    .sort();

/** Raw engine submission of one exact line (bypasses the menu — the engine's own legality is the oracle). */
function rawPlay(game: Game, dest: "base" | "bf1", kills: readonly string[]) {
  const params: Record<string, unknown> = { cardId: "ledros", location: dest === "bf1" ? "battlefield-bf1" : "base" };
  if (kills.length > 0) {
    Object.assign(params, { costs: { paid: { "kill-any": { objects: [...kills] } } }, paidAdditionalCost: true, sacrificeIds: [...kills] });
  }
  return game.p1.try((p) => p.do("playUnit", params));
}

const cardsPlayed = (game: Game) => game.gameState.cardsPlayedThisTurn?.[P1] ?? 0;

describe("Commander Ledros — kill-set × destination combinatorics: a unit must remain at the battlefield he is played TO", () => {
  // ── (a) 6 energy + 2 [order], S1 S2 at bf1, R in base ─────────────────────────────────────────────────

  test("(a) setup: Ledros IS playable at {6, order 2} — but only through kill lines; no kill-set smaller than 2 is offered anywhere (358.2), the enemy unit is never a candidate", async () => {
    const game = await board({ order: 2 }).build();
    expect(game.p1.can("play", "ledros")).toBe(true);
    const all = lines(game);
    expect(all.length).toBeGreaterThan(0);
    for (const l of all) {
      const kills = l.split("/")[1] as string;
      expect(kills).not.toBe("∅");
      expect(kills.split("+").length).toBeGreaterThanOrEqual(2);
      expect(kills).not.toContain("enemy");
    }
  });

  test("(a) destination BASE offers exactly the four payable kill-sets {S1,S2} {S1,R} {S2,R} {S1,S2,R}", async () => {
    const game = await board({ order: 2 }).build();
    expect(linesAt(game, "base")).toEqual(["r+s1", "r+s1+s2", "r+s2", "s1+s2"]);
  });

  // bf1 × {S1,R} and bf1 × {S2,R} leave a Sergeant at bf1 → legal and offered (every kill line is offered at every destination).
  test("(a) destination bf1 offers {S1,R} and {S2,R} (a Sergeant stays behind → location valid, 355.2.a)", async () => {
    const game = await board({ order: 2 }).build();
    expect(linesAt(game, "bf1")).toEqual(expect.arrayContaining(["r+s1", "r+s2"]));
    await game.p1.play("ledros", { costs: { paid: { "kill-any": ["s2", "r"] } }, to: "bf1" });
    expect(game.zoneOf("ledros")).toBe("battlefield-bf1");
  });

  // RULING-CONFLICT: riftjudge 730775fe (Ledros) / 7e1f5339… (Cruel Patron) say a kill-set that empties the destination is
  // not even offered; CR 190.4 / 323.6 + official 9a32c2cc829f221a say control persists while the play is on the chain, so
  // the location stays Valid — engine follows CR: bf1 offers {S1,S2} and {S1,S2,R} exactly like base.
  test("(a) destination bf1 ALSO offers {S1,S2} and {S1,S2,R} — control of bf1 cannot lapse while Ledros is being played (190.4, 323.6, official 9a32c2cc829f221a)", async () => {
    const game = await board({ order: 2 }).build();
    expect(linesAt(game, "bf1")).toEqual(["r+s1", "r+s1+s2", "r+s2", "s1+s2"]);
  });

  test("(a) bf1/{S2,R} submitted to the engine: S2 → trash, R ceases to exist (never in trash), pays 6 + [order][order], Ledros enters bf1 EXHAUSTED beside the untouched S1, P1 keeps bf1", async () => {
    const game = await board({ order: 2 }).build();
    const r = await rawPlay(game, "bf1", ["s2", "r"]);
    expect(r.ok).toBe(true);
    expect(game.zoneOf("s2")).toBe("trash");
    expect(game.zoneOf("r")).toBe("gone");
    expect(game.p1.trash()).toEqual(["s2"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("ledros")).toBe("battlefield-bf1");
    expect(game.state("ledros")).toMatchObject({ controller: P1, isExhausted: true, might: 8 });
    expect(game.zoneOf("s1")).toBe("battlefield-bf1");
    expect(game.state("s1")).toMatchObject({ damage: 2, isExhausted: true });
    expect([...game.p1.units("bf1")].sort()).toEqual(["ledros", "s1"]);
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(cardsPlayed(game)).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("(a) … and a unit with no play trigger finalizes + resolves at once (337.2): no chain item, no priority for P2, P1 straight back in an open main phase", async () => {
    const game = await board({ order: 2 }).build();
    const r = await rawPlay(game, "bf1", ["s2", "r"]);
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.executed.some((m) => m.seat === P2)).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.legal().filter((o) => o.verb !== "concede")).toEqual([]);
  });

  test("(a) base/{S1,S2} through the menu: both Sergeants in trash, R untouched in base, 6 + [order]×2 paid, Ledros in base exhausted", async () => {
    const game = await board({ order: 2 }).build();
    await game.p1.play("ledros", { costs: { paid: { "kill-any": ["s1", "s2"] } }, to: "base" });
    expect([...game.p1.trash()].sort()).toEqual(["s1", "s2"]);
    expect(game.zoneOf("r")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("ledros")).toBe("base");
    expect(game.state("ledros").isExhausted).toBe(true);
  });

  // ── (b) no Recruit: S1 + S2 are P1's only units ──────────────────────────────────────────────────────

  // RULING-CONFLICT: riftjudge 730775fe says bf1 is absent here; CR 190.4 / 323.6 + official 9a32c2cc829f221a keep bf1
  // Valid while the play is pending — engine follows CR: {base, bf1} × {S1,S2}.
  test("(b) without the Recruit the only payable set is {S1,S2}; it is offered to base AND to bf1 (control persists through the play — 190.4, 323.6)", async () => {
    const game = await board({ order: 2, recruit: false }).build();
    expect(game.p1.can("play", "ledros")).toBe(true);
    expect(lines(game)).toEqual(["base/s1+s2", "bf1/s1+s2"]);
    const dests = (game.p1.option("play", "ledros")?.fields.find((f) => f.name === "location")?.options ?? []).map(bf).sort();
    expect(dests).toEqual(["base", "bf1"]);
  });

  test("(b) play it: both Sergeants die as the cost (→ trash), 6 + [order]×2 paid, Ledros lands in base; bf1 holds no P1 unit and is UNCONTROLLED after the next Open-state Cleanup (323.6)", async () => {
    const game = await board({ order: 2, recruit: false }).build();
    await game.p1.play("ledros", { costs: { paid: { "kill-any": ["s1", "s2"] } }, to: "base" });
    expect([...game.p1.trash()].sort()).toEqual(["s1", "s2"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("ledros")).toBe("base");
    expect(game.p1.units("bf1")).toEqual([]);
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  // ── (c) 6 energy + 4 [order]: full price affordable ──────────────────────────────────────────────────

  test("(c) destination BASE offers every subset of {S1,S2,R}, including killing nothing (∅) and killing all three", async () => {
    const game = await board({ order: 4 }).build();
    expect(linesAt(game, "base")).toEqual(["r", "r+s1", "r+s1+s2", "r+s2", "s1", "s1+s2", "s2", "∅"]);
  });

  test("(c) destination bf1 offers ∅ (full price, nobody dies) and — RULING-CONFLICT resolved to CR 190.4/323.6 — {S1,S2} / {S1,S2,R} as well", async () => {
    const game = await board({ order: 4 }).build();
    const atBf1 = linesAt(game, "bf1");
    expect(atBf1).toContain("∅");
    expect(atBf1).toContain("s1+s2");
    expect(atBf1).toContain("r+s1+s2");
  });

  // Every kill line is a cost of PLAYING him (356.2.b), so bf1 lists every subset base does.
  test("(c) destination bf1 offers every subset of {S1,S2,R} — the same eight lines as base", async () => {
    const game = await board({ order: 4 }).build();
    expect(linesAt(game, "bf1")).toEqual(["r", "r+s1", "r+s1+s2", "r+s2", "s1", "s1+s2", "s2", "∅"]);
  });

  test("(c) cost = 6 + (4 − |kills|) [order]: ∅ → order 4→0; {R} → 4→1; {S1,R} (to bf1, raw) → 4→2; {S1,S2,R} → 4→3 — always all 6 energy", async () => {
    const none = await board({ order: 4 }).build();
    await none.p1.play("ledros", { to: "bf1" });
    expect(none.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect([...none.p1.units("bf1")].sort()).toEqual(["ledros", "s1", "s2"]);

    const one = await board({ order: 4 }).build();
    await one.p1.play("ledros", { costs: { paid: { "kill-any": ["r"] } }, to: "base" });
    expect(one.p1.resources()).toEqual({ energy: 0, power: { order: 1 } });
    expect(one.zoneOf("r")).toBe("gone");

    const two = await board({ order: 4 }).build();
    expect((await rawPlay(two, "bf1", ["s1", "r"])).ok).toBe(true);
    expect(two.p1.resources()).toEqual({ energy: 0, power: { order: 2 } });
    expect(two.zoneOf("ledros")).toBe("battlefield-bf1");
    expect([...two.p1.units("bf1")].sort()).toEqual(["ledros", "s2"]);

    const three = await board({ order: 4 }).build();
    await three.p1.play("ledros", { costs: { paid: { "kill-any": ["s1", "s2", "r"] } }, to: "base" });
    expect(three.p1.resources()).toEqual({ energy: 0, power: { order: 3 } });
    expect([...three.p1.trash()].sort()).toEqual(["s1", "s2"]);
    expect(three.zoneOf("ledros")).toBe("base");
  });

  // ── (d) raw {bf1, kill S1 + S2} on board (a) ────────────────────────────────────────────────────────

  // RULING-CONFLICT: riftjudge 730775fe (Ledros) / 7e1f5339… / db8a04e8… (Cruel Patron) say this line is illegal and
  // fully undone (358.5); CR 190.4 / 323.6 (control lapses only in an OPEN-state Cleanup — the play is on the chain while
  // its cost is paid) + official 9a32c2cc829f221a say it is legal — engine follows CR: both Sergeants die as the cost, 6 +
  // [order]×2 is paid, Ledros lands ALONE on bf1 and, holding it himself, keeps it for P1.
  test("(d) raw playUnit {bf1, kill [S1,S2]} is LEGAL — S1 + S2 in trash, R untouched, pool 0/0, Ledros alone at bf1 which stays P1's (190.4, 323.6, official 9a32c2cc829f221a)", async () => {
    const game = await board({ order: 2 }).build();
    const r = await rawPlay(game, "bf1", ["s1", "s2"]);
    expect(r.ok).toBe(true);
    expect([...game.p1.trash()].sort()).toEqual(["s1", "s2"]);
    expect(game.zoneOf("r")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("ledros")).toBe("battlefield-bf1");
    expect([...game.p1.units("bf1")]).toEqual(["ledros"]);
    expect(game.chain()).toEqual([]);
    expect(cardsPlayed(game)).toBe(1);
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(d) whatever the engine decides about that line, it is never a PARTIAL rollback: either everything happened (Ledros on bf1, both paid) or nothing did (Ledros in hand, pool intact)", async () => {
    const game = await board({ order: 2 }).build();
    await rawPlay(game, "bf1", ["s1", "s2"]);
    const landed = game.zoneOf("ledros") === "battlefield-bf1";
    if (landed) {
      expect([...game.p1.trash()].sort()).toEqual(["s1", "s2"]);
      expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
      expect(cardsPlayed(game)).toBe(1);
    } else {
      expect(game.zoneOf("ledros")).toBe("hand");
      expect(game.p1.trash()).toEqual([]);
      expect(game.p1.resources()).toEqual({ energy: 6, power: { order: 2 } });
      expect(cardsPlayed(game)).toBe(0);
    }
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
