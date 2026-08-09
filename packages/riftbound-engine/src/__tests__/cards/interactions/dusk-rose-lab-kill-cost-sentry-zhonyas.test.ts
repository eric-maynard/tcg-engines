/**
 * Interaction: Dusk Rose Lab (unl-209-219) · Battlefield
 *     "At the start of your Beginning Phase, you may kill a unit you control here to draw 1.
 *      (This happens before scoring.)"
 *   × Watchful Sentry (ogn-096-298) · Unit · Mind · 2 · 1 Might — "[Deathknell] — Draw 1."
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · Calm · 2
 *     "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   with Gust (ogn-169-298) · Reaction · 1 — "Return a unit at a battlefield with 3 [Might] or less to
 *     its owner's hand." in P2's hand.
 *
 * Rules: 383.3.a (leading "you may" decided at finalization), 383.3.b / 383.3.b.1 / 740.4.a.2 (a cost
 * within instructions right after that "may" — "kill a unit you control here TO draw 1" — is the
 * trigger's BASE COST, paid at finalization; cf. 355.10.c.1: the killed unit is a cost object, not a
 * target), 402.1 / 402.2 / 404.1 (opt in → choose the cost object → pay), 404.2 (unpayable → removed,
 * no prompt worth asking), 808.1.d.2 + 337.3 (the Deathknell pends the moment the unit is killed and is
 * finalized on top before anyone gets priority), 406.4 (Reactions only after that), 340/LIFO
 * (Deathknell "Draw 1" resolves before the Lab's "draw 1"), 357.2.a (a cost replaced by Zhonya's is
 * still paid), 808.1.d.1 (no Deathknell if the unit never reached the trash), 315.2.a.1 → 315.2.b.2 /
 * 469.2 + 190.4.c / 323.6 (the kill happens in the Beginning Step; with no unit left the Lab is lost
 * at the next Open-state cleanup, so no Hold point in the Scoring Step), 190.6 (only the controller's
 * trigger).
 *
 * Q (P2 ends turn 2 → P1's turn 3 starts):
 *  (a) only the Sentry at the Lab, P1 opts in — Sentry dies AT FINALIZATION (cost), Deathknell is
 *      finalized on top, and only then does P2 get priority: Sentry is already in the trash, Gust has
 *      nothing to hit. Resolution: Deathknell draw, then Lab draw (2 cards + the draw-phase card = 3).
 *      No unit left → control lapses → NO Hold point.
 *  (b) a second unit at the Lab — same two draws, and the survivor keeps control → +1 point.
 *  (c) Zhonya's on board — the cost-kill is replaced (Hourglass dies; Sentry healed, exhausted,
 *      recalled to base); the cost still counts as paid → Lab draws 1; NO Deathknell; Lab now empty →
 *      no Hold point either.
 *  (d) only P2's unit at the Lab / P1's unit in base — no prompt at all (nothing "you control here").
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DUSK_ROSE_LAB = "unl-209-219";
const WATCHFUL_SENTRY = "ogn-096-298";
const ZHONYAS = "ogn-077-298";
const GUST = "ogn-169-298";

/**
 * Turn 2, P2 active and about to end the turn. P1 controls (and occupies) Dusk Rose Lab with Watchful
 * Sentry. P2 holds Gust and one ready chaos rune (pools empty at end of turn, so P2 taps it at Reaction
 * speed when it matters). P1's hand is empty; P1's turn draws exactly 1 in the draw phase.
 */
function board(opts: { second?: boolean; zhonyas?: boolean } = {}) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .battlefield("lab", { controller: P1, def: DUSK_ROSE_LAB, inert: false, owner: P1 })
    .unit(P1, "lab", WATCHFUL_SENTRY, "sentry")
    .rune(P2, "chaos", { alias: "p2rune" })
    .hand(P2, GUST, "gust");
  if (opts.second) {
    b.unit(P1, "lab", { might: 2, name: "Lab Assistant" }, "assistant");
  }
  if (opts.zhonyas) {
    b.gear(P1, ZHONYAS, "zh");
  }
  return b;
}

/** Step (passes / forced answers only) until `pred` holds. */
async function until(game: Game, pred: (d: Decision | null) => boolean, max = 30): Promise<Decision | null> {
  for (let i = 0; i < max; i++) {
    if (pred(game.decision())) {
      return game.decision();
    }
    const r = await game.settle({ maxSteps: 1 });
    if (r.reason !== "max-steps" && !pred(game.decision())) {
      break;
    }
  }
  expect(pred(game.decision())).toBe(true);
  return game.decision();
}

const chainIds = (game: Game): string[] => game.chain().map((c) => c.cardId);

function gustTargets(game: Game): string[] {
  const field = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

describe("Dusk Rose Lab × Watchful Sentry × Zhonya's Hourglass — the kill is the trigger's finalization cost", () => {
  // ── (a) only the Sentry at the Lab ─────────────────────────────────────────────────────────────

  test("(a) at the start of P1's Beginning Phase the Lab trigger pends and P1 — its controller — is asked the leading 'you may' at FINALIZATION; nothing scored yet (315.2.a.1, 383.3.a)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lab", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "lab" }, timing: "FIN" });
    expect(game.p1.points()).toBe(0);
    expect(game.zoneOf("sentry")).toBe("battlefield-lab");
  });

  // Expected (383.3.b, 740.4.a.2, 404.1, 808.1.d.2, 337.3): "kill a unit you control here" is PAID as P1
  // opts in — the Sentry is in the trash and its Deathknell is finalized on top of the Lab item before
  // any player holds priority. Actual: the engine treats the kill as a resolution-time instruction — after
  // yes() the Sentry is still at the Lab and the chain holds only the Lab item.
  test("BUG: (a) opting in kills the Sentry immediately as the cost — before anyone has priority it is in the trash and its Deathknell sits on top of the Lab trigger (383.3.b, 740.4.a.2, 808.1.d.2, 337.3)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.yes();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "lab", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "sentry", controller: P1, triggered: true }),
    ]);
    expect(game.p1.hand()).toHaveLength(0); // nothing has resolved yet
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  // Expected (406.4): P2's first Reaction window opens only after the cost is paid — the Sentry is gone,
  // no unit is at any battlefield, so Gust has no legal target and cannot be cast at all. Actual: the
  // Sentry is still on the board when P2 gets priority; Gust is castable on it (and bouncing it even
  // leaves the Lab drawing a card for a kill that never happened).
  test("BUG: (a) P2 cannot Gust the Sentry 'in response' — when P2 first holds priority it is already in the trash, so Gust has no legal target (406.4, 383.3.b.1)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.yes();
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.tapRune("p2rune");
    expect(game.p2.energy()).toBe(1); // Gust is affordable — only the target is missing
    expect(gustTargets(game)).not.toContain("sentry");
    expect(game.p2.can("cast", "gust")).toBe(false);
    expect((await game.p2.try((p) => p.cast("gust", { targets: "sentry" }))).ok).toBe(false);
    expect(game.zoneOf("sentry")).toBe("trash");
  });

  // Expected (LIFO): the Deathknell (newer item) resolves first — when P1's first card arrives the Lab
  // trigger is still waiting on the chain. Actual: the Lab resolves first (kill + draw), and the
  // Deathknell is only then put on the chain, so the first card comes from the Lab with the Sentry's
  // trigger pending above nothing.
  test("BUG: (a) resolution order is LIFO — the Deathknell 'Draw 1' resolves while the Lab's 'draw 1' is still on the chain (808.1.d.2, 337.3, 340)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.yes();
    await until(game, () => game.p1.hand().length >= 1);
    expect(game.p1.hand()).toHaveLength(1);
    expect(chainIds(game)).toEqual(["lab"]);
  });

  test("(a) nobody responds: the Sentry ends in the trash and P1 nets 2 cards from the trigger (Deathknell + Lab) plus the draw-phase card = 3 in hand; chain empty in P1's main phase", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await game.p2.endTurn();
    await game.p1.yes();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.p1.deck()).toHaveLength(deck0 - 3);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("gust")).toBe("hand"); // P2 kept it
    expect(game.violations()).toEqual([]);
  });

  test("(a) the trade: with its only unit gone P1 loses control of the Lab at the Open-state cleanup and scores NO Hold point this Beginning Phase (190.4.c, 323.6, 315.2.b.2, 469.2)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.yes();
    await game.settle();
    expect(game.p1.units("lab")).toEqual([]);
    expect(game.gameState.battlefields.lab?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("(a) contrast — declining: nothing dies, no Lab draw (1 card from the draw phase only) and P1 HOLDS the Lab for 1 point (383.3.a.2)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.no();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("sentry")).toBe("battlefield-lab");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.lab?.controller).toBe(P1);
  });

  // ── (b) a second unit at the Lab ───────────────────────────────────────────────────────────────

  test("(b) with a second unit here P1 picks WHICH unit pays (only units here are offered), feeds the Sentry, draws the same 2 (+1 draw phase = 3) AND still holds via the survivor → 1 point", async () => {
    const game = await board({ second: true }).build();
    await game.p2.endTurn();
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["assistant", "sentry"]);
    await game.p1.pick("sentry");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("assistant")).toBe("battlefield-lab");
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.gameState.battlefields.lab?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) Zhonya's Hourglass replaces the cost-kill ──────────────────────────────────────────────

  test("(c) Zhonya's is mandatory and replaces the cost-kill: the Hourglass goes to the trash; the Sentry is NOT killed — it is recalled to P1's base, exhausted, undamaged (357.2.a, 370)", async () => {
    const game = await board({ zhonyas: true }).build();
    await game.p2.endTurn();
    await game.p1.yes();
    const d = game.decision();
    expect(d?.kind === "order" || (d?.kind === "yes-no" && d.source?.cardId === "zh")).toBe(false); // no opt-out / ordering
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("base");
    expect(game.p1.units("base")).toContain("sentry");
    expect(game.state("sentry")).toMatchObject({ controller: P1, damage: 0, isExhausted: true, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("(c) the replaced cost still counts as PAID → the Lab trigger resolves and P1 draws 1; the Sentry never hit the trash → NO Deathknell draw: exactly 2 in hand (Lab + draw phase) (357.2.a, 808.1.d.1)", async () => {
    const game = await board({ zhonyas: true }).build();
    const deck0 = game.p1.deck().length;
    await game.p2.endTurn();
    await game.p1.yes();
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.deck()).toHaveLength(deck0 - 2);
    expect(game.p1.trash()).toEqual(["zh"]); // only the Hourglass died
    expect(game.chain()).toEqual([]);
  });

  test("(c) …and P1 does not hold either: the recalled Sentry left the Lab empty → control lapses at the Open-state cleanup → 0 points (190.4.c, 323.6, 469.2)", async () => {
    const game = await board({ zhonyas: true }).build();
    await game.p2.endTurn();
    await game.p1.yes();
    await game.settle();
    expect(game.p1.units("lab")).toEqual([]);
    expect(game.gameState.battlefields.lab?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
  });

  // ── (d) nothing "you control here" ─────────────────────────────────────────────────────────────

  test("(d) P1 controls the Lab but the only unit there is P2's (P1's own unit sits in base): no prompt, nothing dies, no extra card — only the draw-phase card (404.2, 355.10.c.1)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("lab", { controller: P1, def: DUSK_ROSE_LAB, inert: false, owner: P1 })
      .unit(P2, "lab", WATCHFUL_SENTRY, "theirSentry")
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
      .build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    const d = game.decision();
    if (d?.kind === "yes-no") {
      // Tolerated UI shape (DESIGN.md §Paying costs): if asked at all, "yes" must be impossible.
      expect(d.canAccept).toBe(false);
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      await game.p1.no();
    } else {
      expect(d?.kind).not.toBe("pick");
    }
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("theirSentry")).toBe("battlefield-lab");
    expect(game.zoneOf("home")).toBe("base");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p2.hand()).toHaveLength(0); // P2's Deathknell never fired
    expect(game.chain()).toEqual([]);
  });

  test("(d) P1 does NOT control the Lab (P2 does, with P2's unit there): P1's Beginning Phase triggers nothing at all — it is not P1's trigger (190.6); P2's unit is safe and P1 just draws for the turn", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("lab", { controller: P2, def: DUSK_ROSE_LAB, inert: false, owner: P1 })
      .unit(P2, "lab", WATCHFUL_SENTRY, "theirSentry")
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
      .build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect(game.decision()?.kind).not.toBe("pick");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("theirSentry")).toBe("battlefield-lab");
    expect(game.zoneOf("home")).toBe("base");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.lab?.controller).toBe(P2);
  });
});
