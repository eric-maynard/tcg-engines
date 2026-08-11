/**
 * Interaction: Safety Inspector (unl-164-219) · Unit · Order · 5+[order] · 3 Might
 *     "You may spend 3 XP as an additional cost to play me. When you play me, each player must kill one of their units.
 *      If you paid my additional cost, you don't kill a unit this way."
 *   × Ruin Runner (sfd-105-221) · Unit · Body · 6 · 5 Might · "I can't be chosen by enemy spells and abilities."
 *   × Promising Future (ogn-115-298) · Spell · Mind · 5+[mind] · "Each player looks at the top 5 cards of their Main Deck,
 *     banishes one of them, then recycles the rest. Starting with the next player, each player plays those cards, ignoring
 *     Energy costs. (They must still pay Power costs.)"
 *
 * Position: P2's only unit is Ruin Runner at bf2 (P2's).
 *
 * Question:
 *  (a) P1's turn, P1 has 3 XP and no other units, plays the Inspector to base WITHOUT paying XP. On resolution of the play
 *      trigger: who kills first; may/must P1 kill the Inspector itself; must P2 kill Ruin Runner despite its text; is
 *      either player offered a "decline"?
 *  (b) Same but P1 elects the 3-XP additional cost: when is the XP spent, who kills what?
 *  (c) P1 has only 2 XP: is the XP variant offered at all?
 *  (d) Rollback: P1 has 3 XP, wants the XP variant but cannot complete the energy payment — what residue is allowed?
 *  (e) Via Promising Future cast by P1: P2 banishes Safety Inspector from its top 5 and, "starting with the next player",
 *      plays it on P1's TURN ignoring Energy. Is P2 still offered the 3-XP option? If P2 declines, in what order do the two
 *      players perform their forced kills — controller (P2) first or turn player (P1) first?
 *
 * Rules: 355.10.e/.f ("each player must kill one of their units" targets nothing — each player chooses on resolution),
 * 303.2.a (simultaneous actions → turn order starting with the Turn Player), 128.6 (board units are public — "must" is
 * enforceable), 757-style "can't be chosen by ENEMY spells/abilities" is relative to the chooser (P2 choosing its own
 * Runner is fine), 355.1.a / 356.2.b.1 / 357 (an optional additional cost is elected in step 2 and paid in Pay Costs —
 * before anyone has priority), 355.16 / 357.3 / 358.2 (an unpayable election is not offered), 358.5 (an incomplete play
 * is undone), 419.3.b (a play instructed by an effect follows every normal step except as noted — PF ignores ENERGY only,
 * so optional additional costs stay electable and Power is still paid).
 * DESIGN (DESIGN.md §Paying costs): plays are offered only when the CURRENT pool covers them; there is no mid-payment
 * rune-tap step to abandon — (d) is therefore "the XP line is absent and a forced move is refused with zero residue".
 *
 * Expected: (a) trigger finalizes with no choices; P2 gets priority; on resolution P1 (turn player) kills first — its
 * only unit IS the Inspector, so it dies (RiftJudge: the Inspector can kill himself); then P2 must kill Ruin Runner
 * (its own choice — the protection is irrelevant); no decline anywhere; two sequential kills. (b) XP 3→0 at play, before
 * P2's priority; only P2 kills (Runner); Inspector stays. (c) only the plain line. (d) no XP variant listed; forced move
 * refused; XP 3, Inspector in hand, chain empty, no trigger, state hash unchanged, P2 sees nothing. (e) P2 IS offered
 * "spend 3 XP"; declining → P1 (turn player) picks its kill FIRST, then P2; each pick lists only that seat's own units;
 * P2 paid [order] from its own pool and no energy. If P2 pays the XP instead, only P1 kills.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SAFETY_INSPECTOR = "unl-164-219";
const RUIN_RUNNER = "sfd-105-221";
const PROMISING_FUTURE = "ogn-115-298";

const FILLER = { cardType: "unit", energyCost: 3, might: 1, name: "Filler" } as const;
const UNIT_X = { cardType: "unit", energyCost: 2, might: 2, name: "Unit X" } as const;

type Pick = Extract<Decision, { kind: "pick" }>;
const keysOf = (d: Decision | null): string[] => (d?.kind === "pick" ? d.options.map((o) => o.key) : []);

interface BoardOpts {
  xp?: number;
  energy?: number;
  /** P1 also controls a 2-Might "Pal" in base. */
  p1Pal?: boolean;
  /** P2 also controls a 2-Might "Grunt" at bf2. */
  p2Grunt?: boolean;
}

/**
 * (a)–(d): P1's turn. P1: `xp` (3) XP, `energy` (5) + [order], Safety Inspector in hand, no units (optionally a Pal).
 * P2: Ruin Runner at bf2 (P2's), optionally a Grunt beside it.
 */
function board(o: BoardOpts = {}) {
  let s = scenario()
    .xp(P1, o.xp ?? 3)
    .resources(P1, { energy: o.energy ?? 5, power: { order: 1 } })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", RUIN_RUNNER, "runner")
    .hand(P1, SAFETY_INSPECTOR, "insp");
  if (o.p1Pal) {
    s = s.unit(P1, "base", { might: 2, name: "Pal" }, "pal");
  }
  if (o.p2Grunt) {
    s = s.unit(P2, "bf2", { might: 2, name: "Grunt" }, "grunt");
  }
  return s;
}

/** The playUnit variants offered for the Inspector, as {xp} quotes. */
function inspectorLines(game: Game): { xp: number; energy: number }[] {
  return (game.p1.option("playUnit", "insp")?.variants ?? []).map((v) => {
    const q = (v.params.quote ?? {}) as { xp?: number; energy?: number };
    return { energy: q.energy ?? 0, xp: q.xp ?? 0 };
  });
}

/** Play the Inspector (with or without the XP), then P1 and P2 pass priority once each → the trigger starts resolving. */
async function playAndPass(game: Game, payXp: boolean): Promise<void> {
  await game.p1.play("insp", payXp ? { payOptional: true } : {});
  expect(game.zoneOf("insp")).toBe("base");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "insp", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // finalized with no choices asked
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2 does get priority
  await game.p2.passPriority();
}

// ── (e) Promising Future board ──────────────────────────────────────────────────────────────────

/**
 * P1's turn. P1: exactly 5 + [mind] (Promising Future), two 2-Might units in base (a real kill choice), controls no
 * battlefield; deck top = Unit X. P2: 0 energy + [order], `p2xp` XP, Ruin Runner at bf2; deck top = Safety Inspector.
 */
function pfBoard(p2xp = 3) {
  return scenario()
    .resources(P1, { energy: 5, power: { mind: 1 } })
    .resources(P2, { energy: 0, power: { order: 1 } })
    .xp(P2, p2xp)
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", RUIN_RUNNER, "runner")
    .unit(P1, "base", { might: 2, name: "P1 A" }, "p1a")
    .unit(P1, "base", { might: 2, name: "P1 B" }, "p1b")
    .deck(P1, [UNIT_X, FILLER, FILLER, FILLER, FILLER, FILLER], ["x", "a2", "a3", "a4", "a5", "a6"])
    .deck(P2, [SAFETY_INSPECTOR, FILLER, FILLER, FILLER, FILLER, FILLER], ["insp", "b2", "b3", "b4", "b5", "b6"])
    .hand(P1, PROMISING_FUTURE, "pf");
}

/** Step (passes / forced answers only) until `pred` holds for the current decision. */
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

const isPickFor = (seat: string, re: RegExp) => (d: Decision | null) => d?.kind === "pick" && d.seat === seat && re.test(d.prompt);
const isYesNoFor = (seat: string) => (d: Decision | null) => d?.kind === "yes-no" && d.seat === seat;

/**
 * Cast PF, P1 banishes X, P2 banishes the Inspector; P2 (next player) plays it first: destination → base; then P2 is
 * asked the 3-XP option. Returns with THAT yes/no open.
 */
async function pfUpToXpOffer(game: Game): Promise<void> {
  await game.p1.cast("pf");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  await until(game, isPickFor(P1, /banish/i));
  await game.p1.pick("x");
  await until(game, isPickFor(P2, /banish/i));
  expect(keysOf(game.decision()).sort()).toEqual(["b2", "b3", "b4", "b5", "insp"]);
  await game.p2.pick("insp");
  expect(game.zoneOf("insp")).toBe("banishment");
  await until(game, isPickFor(P2, /destination/i));
  expect(keysOf(game.decision()).sort()).toEqual(["base", "battlefield-bf2"]); // P2's OWN locations
  await game.p2.pick("base");
  await until(game, isYesNoFor(P2));
}

describe("Safety Inspector — forced per-player kills in turn order; XP option timing; via Promising Future on the opponent's turn", () => {
  test("setup sanity: the Inspector costs 5 + [order]; with 3 XP and 5 energy P1 is offered exactly two lines — plain (xp 0) and 'spend 3 XP' (xp 3), both 5 energy", async () => {
    const game = await board().build();
    expect(game.state("insp")).toMatchObject({ energyCost: 5, powerCost: ["order"] });
    expect(inspectorLines(game).sort((a, b) => a.xp - b.xp)).toEqual([{ energy: 5, xp: 0 }, { energy: 5, xp: 3 }]);
    expect(game.state("runner").keywords).toContain("Untargetable");
  });

  // ── (a) no XP paid ────────────────────────────────────────────────────────────────────────────

  test("(a) no XP: the trigger finalizes with NO choices, P2 gets priority; on resolution P1's only unit — the Inspector itself, on the board — is killed, then P2's Ruin Runner is killed by P2's own forced choice (its 'can't be chosen by ENEMY' text is irrelevant); XP stays 3; nobody was asked anything (both choices forced)", async () => {
    const game = await board().build();
    await playAndPass(game, false);
    // both single-option "must" choices are forced — no prompt, straight back to P1's main phase
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("insp")).toBe("trash");
    expect(game.p1.trash()).toContain("insp");
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.p2.trash()).toContain("runner");
    expect(game.p1.xp()).toBe(3);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(a) turn order, P1 FIRST (303.2.a): when P2 has two units (so P2 must actually choose), P2's pick appears only AFTER P1's forced kill — the Inspector is already in the trash; P2's pick lists ONLY P2's units (Runner included), cannot be declined, and is P2's own decision", async () => {
    const game = await board({ p2Grunt: true }).build();
    await playAndPass(game, false);
    const d = game.decision() as Pick;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P2 });
    expect(keysOf(d).sort()).toEqual(["grunt", "runner"]);
    expect(game.zoneOf("insp")).toBe("trash"); // P1 already performed its kill
    expect(game.p2.decision()).toMatchObject({ kind: "pick", seat: P2 }); // answerable from P2's own seat
    expect((await game.p2.try((p) => p.decline())).ok).toBe(false);
    await game.p2.pick("runner"); // choosing the 'unchoosable-by-enemies' Runner is legal for its own controller
    await game.settle();
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.zoneOf("grunt")).toBe("battlefield-bf2");
  });

  test("(a) P1 MAY pick the Inspector itself when it has another unit: P1's pick {insp, pal} comes first (Runner still alive at that moment), no decline; picking the Inspector kills it, Pal survives, then the Runner dies", async () => {
    const game = await board({ p1Pal: true }).build();
    await playAndPass(game, false);
    const d = game.decision() as Pick;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", seat: P1 });
    expect(keysOf(d).sort()).toEqual(["insp", "pal"]); // only P1's own units
    expect(game.zoneOf("runner")).toBe("battlefield-bf2"); // P2 has not killed yet
    expect((await game.p1.try((p) => p.decline())).ok).toBe(false);
    await game.p1.pick("insp");
    await game.settle();
    expect(game.zoneOf("insp")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("base");
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // ── (b) XP paid ───────────────────────────────────────────────────────────────────────────────

  test("(b) electing the 3-XP additional cost spends the XP in the Pay Costs step — XP is 0 the moment the Inspector is on the board, BEFORE P2 ever holds priority (355.1.a / 357)", async () => {
    const game = await board().build();
    await game.p1.play("insp", { payOptional: true });
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("insp")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.xp()).toBe(0);
  });

  test("(b) on resolution P1 is exempt ('you don't kill a unit this way') — the Inspector stays; P2 still must kill Ruin Runner", async () => {
    const game = await board().build();
    await playAndPass(game, true);
    await game.settle();
    expect(game.zoneOf("insp")).toBe("base");
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.p1.xp()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) 2 XP ──────────────────────────────────────────────────────────────────────────────────

  test("(c) with only 2 XP the XP variant is simply not offered — one plain line; forcing payOptional is rejected with nothing spent (355.16 / 358.2)", async () => {
    const game = await board({ xp: 2 }).build();
    expect(inspectorLines(game)).toEqual([{ energy: 5, xp: 0 }]);
    await expect(game.p1.play("insp", { payOptional: true })).rejects.toThrow();
    expect(game.zoneOf("insp")).toBe("hand");
    expect(game.p1.xp()).toBe(2);
    expect(game.p1.energy()).toBe(5);
    expect(game.chain()).toEqual([]);
  });

  // ── (d) rollback / no residue ─────────────────────────────────────────────────────────────────

  test("(d) 3 XP but the pool is 1 energy short (a ready rune untapped): NO Inspector line is offered at all — the XP election cannot be started, a raw playUnit naming it is refused, and there is zero residue: XP 3, Inspector in hand, rune ready, chain empty, no trigger, P2's view unchanged, state hash identical (358.5)", async () => {
    // DESIGN (DESIGN.md §Paying costs): the engine never parks a play mid-payment (357.1.a Add sub-step not modelled);
    // a play is offered only when the current pool covers it, so "abandoning the payment" collapses to "never begun".
    const game = await board({ energy: 4 }).rune(P1, "order", { alias: "r1" }).build();
    expect(inspectorLines(game)).toEqual([]);
    expect(game.p1.can("play", "insp")).toBe(false);
    const hash0 = game.stateHash();
    const p2view0 = JSON.stringify({ chain: game.p2.view().chain, zones: game.p2.view().zones });
    const raw = await game.p1.try((p) => p.do("playUnit", { cardId: "insp", location: "base", paidAdditionalCost: true }));
    expect(raw.ok).toBe(false);
    await expect(game.p1.play("insp", { payOptional: true })).rejects.toThrow();
    expect(game.stateHash()).toBe(hash0);
    expect(game.p1.xp()).toBe(3);
    expect(game.zoneOf("insp")).toBe("hand");
    expect(game.p1.runes({ ready: true })).toEqual(["r1"]);
    expect(game.p1.energy()).toBe(4);
    expect(game.chain()).toEqual([]);
    expect(JSON.stringify({ chain: game.p2.view().chain, zones: game.p2.view().zones })).toBe(p2view0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // and once the rune IS tapped the XP line appears and works
    await game.p1.tapRune("r1");
    expect(inspectorLines(game).some((l) => l.xp === 3)).toBe(true);
    await game.p1.play("insp", { payOptional: true });
    expect(game.p1.xp()).toBe(0);
    expect(game.zoneOf("insp")).toBe("base");
  });

  // ── (e) via Promising Future, on P1's turn ────────────────────────────────────────────────────

  test("(e) Promising Future ignores only ENERGY: P2, playing the Inspector on P1's turn, is still OFFERED 'spend 3 XP' (yes/no to P2, canAccept) after choosing its destination among P2's own locations (419.3.b)", async () => {
    const game = await pfBoard().build();
    await pfUpToXpOffer(game);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
    expect(game.decision()?.prompt ?? "").toMatch(/3 XP/);
    expect(game.turnPlayer()).toBe(P1);
  });

  test("(e) P2 DECLINES the XP: the Inspector enters P2's base (P2 paid [order] from its own pool, 0 energy), its trigger goes on the chain; on resolution the TURN PLAYER P1 — the opponent of the controller — chooses its kill FIRST from P1's own units only, THEN P2 chooses from {insp, runner}; no declines (303.2.a)", async () => {
    const game = await pfBoard().build();
    await pfUpToXpOffer(game);
    await game.p2.no();
    expect(game.p2.xp()).toBe(3);
    expect(game.zoneOf("insp")).toBe("base");
    expect(game.state("insp")).toMatchObject({ controller: P2, isExhausted: true, owner: P2 });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } }); // Power still paid, Energy ignored
    expect(game.chain().some((i) => i.cardId === "insp" && i.triggered && i.controller === P2)).toBe(true);
    // drive to the first kill prompt
    const first = (await until(game, (d) => d?.kind === "pick" && /target|kill/i.test(d.prompt))) as Pick;
    expect(first.seat).toBe(P1); // turn player first
    expect(first.allowDecline).toBe(false);
    expect(keysOf(first)).toEqual(expect.arrayContaining(["p1a", "p1b"]));
    expect(keysOf(first)).not.toContain("runner");
    expect(keysOf(first)).not.toContain("insp");
    expect(game.zoneOf("runner")).toBe("battlefield-bf2"); // P2 has not acted yet
    await game.p1.pick("p1a");
    const second = (await until(game, (d) => d?.kind === "pick" && d.seat === P2)) as Pick;
    expect(second).toMatchObject({ allowDecline: false, kind: "pick", seat: P2 });
    expect(keysOf(second).sort()).toEqual(["insp", "runner"]);
    expect(game.zoneOf("p1a")).toBe("trash"); // P1's kill already happened
    await game.p2.pick("runner");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.zoneOf("insp")).toBe("base");
    expect(game.zoneOf("p1b")).toBe("base");
    expect(game.zoneOf("x")).toBe("base"); // P1's banished card was played too
    expect(game.zoneOf("pf")).toBe("trash");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(e) P2 PAYS the XP instead: P2's XP 3→0 at the play; on resolution only P1 (turn player) must kill one of its units — Ruin Runner and the Inspector both survive", async () => {
    const game = await pfBoard().build();
    await pfUpToXpOffer(game);
    await game.p2.yes();
    expect(game.p2.xp()).toBe(0);
    expect(game.zoneOf("insp")).toBe("base");
    const first = (await until(game, (d) => d?.kind === "pick" && /target|kill/i.test(d.prompt))) as Pick;
    expect(first.seat).toBe(P1);
    expect(keysOf(first)).toEqual(expect.arrayContaining(["p1a", "p1b"]));
    await game.p1.pick("p1b");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("p1b")).toBe("trash");
    expect(game.zoneOf("p1a")).toBe("base");
    expect(game.zoneOf("runner")).toBe("battlefield-bf2");
    expect(game.zoneOf("insp")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("(e) with fewer than 3 XP P2 is NOT asked about the XP at all — the Inspector just enters and both players kill in turn order (P1 first)", async () => {
    const game = await pfBoard(2).build();
    await game.p1.cast("pf");
    await until(game, isPickFor(P1, /banish/i));
    await game.p1.pick("x");
    await until(game, isPickFor(P2, /banish/i));
    await game.p2.pick("insp");
    await until(game, isPickFor(P2, /destination/i));
    await game.p2.pick("base");
    // no yes/no for P2 on the way to the kill prompts
    const first = await until(game, (d) => (d?.kind === "pick" && /target|kill/i.test(d.prompt)) || d?.kind === "yes-no");
    expect(first).toMatchObject({ kind: "pick", seat: P1 });
    expect(game.p2.xp()).toBe(2);
    await game.p1.pick("p1a");
    const second = (await until(game, (d) => d?.kind === "pick" && d.seat === P2)) as Pick;
    expect(keysOf(second).sort()).toEqual(["insp", "runner"]);
    await game.p2.pick("insp"); // the Inspector may be P2's own victim
    await game.settle();
    expect(game.zoneOf("insp")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("battlefield-bf2");
    expect(game.zoneOf("p1a")).toBe("trash");
  });
});
