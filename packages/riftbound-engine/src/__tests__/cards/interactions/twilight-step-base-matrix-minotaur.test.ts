/**
 * Interaction: Twilight Step (ven-105-166) · Spell · Chaos · 2 + [chaos]
 *     "Move a unit with 3 [Might] or less. [Flow] [4][chaos] (You may play this from your trash for its
 *      Flow cost. Then banish it.)"  — ANY unit, friend or foe; the caster picks the destination.
 *   × Minotaur Reckoner (sfd-014-221) · Unit · Fury · 5 · 5 Might — "Units can't move to base."
 *   × Determined Sentry (unl-111-219) · Unit · Body · 1 · 1 Might — "I can't move to base."
 *   (+ Shipyard Skulker ogn-175-298 as the vanilla 3-Might S1.)
 *
 * Rules: 355.4 / 355.4.a (a Move effect's destination is chosen at play time from the locations OTHER
 * than the unit's current one where it is ALLOWED TO BE PRESENT), 323.7 (a permanent in a base other than
 * its controller's is correctively recalled — so the enemy base is never such a location), 420.3 / 420.3.a
 * (an effect-move does not exhaust), 190.3.a / 190.3.a.1 (the ARRIVING unit's controller applies
 * Contested — only if it doesn't already control the destination), 450 / 453 (post-move Cleanup stages
 * the Showdown / Combat), 323.9 / 323.13, 464.2.c.1 (Combat begun from Neutral Open: the Attacker holds
 * Focus — even on the other player's turn), 345, 054.1 ("can't" beats "can"), 359.3.e.6 (an impossible
 * instruction is ignored — the Ride-the-Wind-at-Vilemaw's-Lair example: "Base is a legal move
 * destination … the move instruction will be ignored"), 144.4.b / 420.3 (the Standard Move
 * battlefield → base is a discretionary action).
 *
 * Board (P1's turn, Neutral Open): bfA — P1 holds it with Shipyard Skulker S1 (3). bfB — P2 holds it with
 * S2 (3). P2's base: R (2). P1 has Twilight Step in hand AND a second copy in trash (Flow), 6 energy +
 * chaos×2 (enough for both).
 *
 * Question / expected:
 *   (a) Target own S1 at bfA → destinations = {P1's base, bfB}. bfA (current) is not offered; P2's base
 *       is never a place a P1 permanent may be (323.7), so it is not offered.
 *   (b) Target enemy R in P2's base → {bfA, bfB} only: no base at all (P1's base is illegal for R, P2's
 *       base is R's current location) — a base-to-base move cannot be constructed in 1v1. Pick bfA: R
 *       moves in unexhausted (420.3.a); R's controller P2 applied Contested (190.3.a) — the caster is
 *       irrelevant; Cleanup stages Showdown+Combat; P2 is the Attacker and holds Focus on P1's turn
 *       (464.2.c.1); 2 into 3 → R dies, S1 healed, P1 keeps bfA, nobody scores. Pick bfB: R joins S2 at
 *       P2's own battlefield — no Contested (190.3.a.1), nothing staged.
 *   (c) Minotaur Reckoner on the board (either side): "base" is STILL offered for S1 (355.4.a asks where
 *       the unit may be PRESENT; Reckoner forbids the Move, not presence). Choosing it: the spell resolves,
 *       the move is impossible and ignored (054.1 + 359.3.e.6); S1 stays at bfA, spell → trash (banishment
 *       if Flowed), costs spent, nothing staged. Determined Sentry as the target: identical treatment.
 *   (d) With Reckoner out S1's discretionary Standard Move bfA → base is not listed at all (an action whose
 *       whole effect is forbidden is absent, not offered-then-rejected) — whereas the spell stays castable.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TWILIGHT_STEP = "ven-105-166";
const RECKONER = "sfd-014-221";
const SENTRY = "unl-111-219";
const SKULKER = "ogn-175-298";

type Opts = { reckoner?: typeof P1 | typeof P2; sentry?: boolean };

/** P1's turn. bfA: P1 + Skulker S1. bfB: P2 + S2 (3). P2 base: R (2). Twilight Step in hand + a Flow copy in trash. */
function board(opts: Opts = {}) {
  let s = scenario()
    .resources(P1, { energy: 6, power: { chaos: 2 } }) // 2+[chaos] from hand AND 4+[chaos] by Flow
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", SKULKER, "s1")
    .unit(P2, "bfB", { might: 3, name: "S2" }, "s2")
    .unit(P2, "base", { might: 2, name: "Raider R" }, "r")
    .hand(P1, TWILIGHT_STEP, "ts")
    .trash(P1, TWILIGHT_STEP, "tsFlow");
  if (opts.reckoner !== undefined) {
    s = s.unit(opts.reckoner, "base", RECKONER, "reck");
  }
  if (opts.sentry) {
    s = s.unit(P1, "bfA", SENTRY, "sentry");
  }
  return s;
}

/** Card ids Twilight Step may choose (flattened `targets` field of the cast option). */
function targetsOffered(game: Game, alias = "ts"): string[] {
  const field = game.p1.option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

/** Cast Twilight Step on `target`; the destination pick (355.4, timing FIN) is asked at once — return its option keys. */
async function destinationsFor(game: Game, target: string, alias = "ts", flow = false): Promise<string[]> {
  await game.p1.cast(alias, flow ? { flow: true, targets: target } : { targets: target });
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
  return (d as PickDecision).options.map((o) => o.key).sort();
}

/** Both players pass priority once each → the lone spell on the chain resolves (nothing beyond that is auto-run). */
async function resolveSpell(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
}

/** Unit ids in P1's "Standard Move → base" option ([] when the option is absent). */
function unitsOfferedToBase(game: Game): string[] {
  const field = game.p1.option("standardMove:to:base")?.fields.find((f) => f.name === "unitIds");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

describe("Twilight Step — destination matrix (own unit / enemy unit in its base) × Minotaur Reckoner / Determined Sentry", () => {
  // ── premise ────────────────────────────────────────────────────────────────────────────────────

  test("premise: 'a unit with 3 [Might] or less' offers S1 (own, 3), S2 (enemy, 3) and R (enemy, 2, sitting in P2's BASE)", async () => {
    const game = await board().build();
    expect(targetsOffered(game)).toEqual(["r", "s1", "s2"]);
    expect(targetsOffered(game, "tsFlow")).toEqual(["r", "s1", "s2"]);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P2 });
  });

  // ── (a) own S1 at bfA ─────────────────────────────────────────────────────────────────────────

  test("(a) targeting own S1 at bfA: destinations = exactly {P1's base, bfB} — bfA (current location) is absent and there is no 'enemy base' option (355.4.a, 323.7)", async () => {
    const game = await board().build();
    expect(await destinationsFor(game, "s1")).toEqual(["base", "battlefield-bfB"]);
    // The spell is already on the chain and paid for; the destination is part of playing it (355.4).
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ts", controller: P1, targets: ["s1"] })]);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { chaos: 1 } });
  });

  test("(a) picking 'base' sends S1 to P1's OWN base, unexhausted (420.3.a); with no P1 unit left bfA lapses to uncontrolled at the next Cleanup (190.4.c)", async () => {
    const game = await board().build();
    await destinationsFor(game, "s1");
    await game.p1.pick("base");
    await resolveSpell(game);
    expect(game.p1.base()).toContain("s1");
    expect(game.p2.base()).not.toContain("s1");
    expect(game.state("s1")).toMatchObject({ controller: P1, isExhausted: false, location: "base" });
    expect(game.zoneOf("ts")).toBe("trash");
    expect(game.gameState.battlefields.bfA?.controller ?? null).toBeNull();
  });

  // ── (b) enemy R in P2's base ──────────────────────────────────────────────────────────────────

  test("(b) targeting enemy R in P2's base: destinations = exactly {bfA, bfB} — neither base is offered, so no base-to-base move exists (355.4.a, 323.7)", async () => {
    const game = await board().build();
    const dests = await destinationsFor(game, "r");
    expect(dests).toEqual(["battlefield-bfA", "battlefield-bfB"]);
    expect(dests).not.toContain("base");
    const r = await game.p1.try((p) => p.pick("base"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("r")).toBe("base"); // nothing moves before resolution
  });

  test("(b) pick bfA: on resolution R arrives at P1's bfA READY (420.3.a), still P2's; R's controller P2 applied Contested (190.3.a) and the Cleanup began a Combat with P2 as ATTACKER holding Focus on P1's turn (453, 464.2.c.1)", async () => {
    const game = await board().build();
    await destinationsFor(game, "r");
    await game.p1.pick("battlefield-bfA");
    await resolveSpell(game);
    expect(game.zoneOf("ts")).toBe("trash");
    expect(game.state("r")).toMatchObject({ combatRole: "attacker", controller: P2, isExhausted: false, location: "bfA", owner: P2 });
    expect(game.state("s1").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.actingSeat()).toBe(P2); // the Attacker holds Focus, not the turn player / caster
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("(b) …combat 2 into 3 / 3 into 2: R dies to P2's trash, S1 survives and is healed, P1 keeps bfA uncontested, nobody scores", async () => {
    const game = await board().build();
    await destinationsFor(game, "r");
    await game.p1.pick("battlefield-bfA");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("r")).toBe("trash");
    expect(game.p2.trash()).toContain("r");
    expect(game.state("s1")).toMatchObject({ combatRole: null, damage: 0, location: "bfA" });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("ts")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) alternative pick bfB (R's controller's own battlefield): R joins S2 there, bfB is NOT Contested (190.3.a.1), no showdown is staged — straight back to P1's Main Phase", async () => {
    const game = await board().build();
    await destinationsFor(game, "r");
    await game.p1.pick("battlefield-bfB");
    await resolveSpell(game);
    expect(game.locationOf("r")).toBe("bfB");
    expect(game.state("r")).toMatchObject({ combatRole: null, controller: P2, isExhausted: false });
    expect(game.p2.units("bfB").sort()).toEqual(["r", "s2"]);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P2 });
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("ts")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // ── (c) Minotaur Reckoner: base still OFFERED, move ignored on resolution ─────────────────────

  for (const side of [P2, P1] as const) {
    const who = side === P1 ? "P1's own" : "P2's";
    test(`(c) with ${who} Minotaur Reckoner out, S1 carries the restriction — yet 'base' is STILL offered as a destination (355.4.a: presence, not movability; 359.3.e.6 example)`, async () => {
      const game = await board({ reckoner: side }).build();
      expect(game.state("s1").keywords).toContain("NoMoveToBase");
      expect(game.p1.can("cast", "ts")).toBe(true);
      expect(targetsOffered(game)).toEqual(["r", "s1", "s2"]); // Reckoner (5) itself is too big
      expect(await destinationsFor(game, "s1")).toEqual(["base", "battlefield-bfB"]);
    });

    test(`(c) …choosing base (${who} Reckoner): Twilight Step resolves, the move is impossible and IGNORED (054.1, 359.3.e.6) — S1 stays READY at bfA, spell → trash, 2+[chaos] stay spent, nothing staged, P1 still holds bfA`, async () => {
      const game = await board({ reckoner: side }).build();
      await destinationsFor(game, "s1");
      await game.p1.pick("base");
      await resolveSpell(game);
      expect(game.locationOf("s1")).toBe("bfA");
      expect(game.state("s1")).toMatchObject({ combatRole: null, controller: P1, isReady: true });
      expect(game.zoneOf("ts")).toBe("trash");
      expect(game.p1.resources()).toEqual({ energy: 4, power: { chaos: 1 } }); // no refund
      expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
      expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
      expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
      expect(game.violations()).toEqual([]);
    });
  }

  test("(c) the Flowed copy behaves the same and is then BANISHED, not trashed: [4][chaos] spent, S1 unmoved under Reckoner", async () => {
    const game = await board({ reckoner: P2 }).build();
    expect(await destinationsFor(game, "s1", "tsFlow", true)).toEqual(["base", "battlefield-bfB"]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 1 } });
    await game.p1.pick("base");
    await resolveSpell(game);
    expect(game.locationOf("s1")).toBe("bfA");
    expect(game.zoneOf("tsFlow")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("tsFlow");
    expect(game.zoneOf("ts")).toBe("hand");
  });

  test("(c) contrast without any restriction the same pick really moves S1 home (so the ignore above is the restriction, not the spell)", async () => {
    const game = await board().build();
    await destinationsFor(game, "s1");
    await game.p1.pick("base");
    await resolveSpell(game);
    expect(game.locationOf("s1")).toBe("base");
  });

  test("(c) Determined Sentry ('I can't move to base', self-sourced) as the target: same path — 'base' offered alongside bfB; chosen → ignored on resolution, Sentry stays ready at bfA, spell → trash", async () => {
    const game = await board({ sentry: true }).build();
    expect(game.state("sentry").keywords).toContain("NoMoveToBase");
    expect(targetsOffered(game)).toEqual(["r", "s1", "s2", "sentry"]);
    expect(await destinationsFor(game, "sentry")).toEqual(["base", "battlefield-bfB"]);
    await game.p1.pick("base");
    await resolveSpell(game);
    expect(game.locationOf("sentry")).toBe("bfA");
    expect(game.state("sentry")).toMatchObject({ controller: P1, isReady: true });
    expect(game.zoneOf("ts")).toBe("trash");
    expect(game.p1.units("bfA").sort()).toEqual(["s1", "sentry"]);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(c) …and the Sentry CAN still be Twilight-Stepped to bfB (only 'to base' is forbidden): it attacks S2 there", async () => {
    const game = await board({ sentry: true }).build();
    await destinationsFor(game, "sentry");
    await game.p1.pick("battlefield-bfB");
    await resolveSpell(game);
    expect(game.locationOf("sentry")).toBe("bfB");
    expect(game.state("sentry").combatRole).toBe("attacker");
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
  });

  // ── (d) Standard Move under Reckoner: not listed at all ───────────────────────────────────────

  test("(d) with Reckoner out, S1's discretionary Standard Move bfA → base is NOT listed (no 'move → base' option at all); forcing it is rejected and exhausts nothing — while Twilight Step remains castable (054.1 vs 355.4.a)", async () => {
    const game = await board({ reckoner: P2 }).build();
    expect(game.p1.option("standardMove:to:base")).toBeUndefined();
    expect(unitsOfferedToBase(game)).toEqual([]);
    const r = await game.p1.try((p) => p.move("s1", "base"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("s1")).toBe("bfA");
    expect(game.state("s1").isReady).toBe(true);
    expect(game.p1.can("cast", "ts")).toBe(true);
    expect(game.p1.can("cast", "tsFlow")).toBe(true);
  });

  test("(d) contrast: without Reckoner the same ready S1 IS offered the Standard Move home (144.4.b) and it works, exhausting S1", async () => {
    const game = await board().build();
    expect(unitsOfferedToBase(game)).toEqual(["s1"]);
    await game.p1.move("s1", "base");
    expect(game.locationOf("s1")).toBe("base");
    expect(game.state("s1").isExhausted).toBe(true);
  });
});
