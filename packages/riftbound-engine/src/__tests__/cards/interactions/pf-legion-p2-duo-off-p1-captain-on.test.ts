/**
 * Interaction: Promising Future (ogn-115-298) · Spell · Mind · 5+[mind] · Action
 *     "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the
 *      rest. Starting with the next player, each player plays those cards, ignoring Energy costs.
 *      (They must still pay Power costs.)"
 *   × Dangerous Duo (ogn-016-298) · Unit · Fury · 3 · 3 Might                        — P2's banished card
 *     "[Legion] — When you play me, give a unit +2 [Might] this turn."
 *   × Vanguard Captain (ogn-218-298) · Unit · Order · 3+[order] · 3 Might             — P1's banished card
 *     "[Legion] — When you play me, play two 1 [Might] Recruit unit tokens here."
 *   (+ En Garde ogn-046-298, a 1-cost Reaction, as "a card P2 played earlier this turn" in variant (d).)
 *
 * Rules: 812.1.b.1 / 812.1.c / 419.4.b (Legion is Active only if a DIFFERENT card has been Finalized by
 * YOU this turn — whoever's turn it is), 354.3 + 303.2.a (plays instructed during a resolution are queued
 * and finalized afterwards, next player first), 356.1.b.2 (only Energy is zeroed; Power is still paid),
 * 337.1.a / 337.2 / 337.3 / 337.4 (finalizing does not pass priority; a unit resolves = enters at once;
 * while Pending items remain keep finalizing; priority only once nothing is Pending), 383.4.a.2 (a
 * "When you play me" becomes Pending after its permanent enters), 350.2 / 185.2.a / 182 / 184.2 / 143.4
 * (tokens are PLAYED by the effect: controller = P1, location restricted to "here", enter exhausted),
 * 355.5 / 355.9.a (a target must exist on the board when it is chosen), 340.1 (LIFO resolution).
 *
 * Q (P1's turn, nobody has played a card; P1 casts PF; P1 banishes Captain, P2 banishes Duo; P1 controls
 * bf1 and puts Captain there):
 *  (a) Is P2's Duo Legion on (PF was played, Captain is being played)? Any Duo trigger / P2 target prompt?
 *      → No: neither card was finalized by P2. Duo enters with no ability; nothing goes on the chain.
 *  (b) Is P1's Captain Legion on when the only other P1 card is the PF that is playing it? → Yes.
 *  (c) Ordering: Duo (P2) finalized first (free, exhausted, no trigger); then Captain (P1 pays [order],
 *      chooses bf1, exhausted) → its trigger is the lone Pending item, finalized at once → FIRST priority
 *      window; on resolution two Recruit tokens are played to bf1, exhausted, with no priority in between.
 *  (d) P2 had played a Reaction earlier this turn → Duo's Legion is on. Duo enters → Duo-trig pends
 *      behind the still-pending Captain; Captain enters → Captain-trig pends. P2 finalizes Duo-trig with
 *      Captain already on the board (legal target); the Recruits don't exist yet (not targetable). Then
 *      first priority; LIFO: Captain's tokens enter first, Duo's +2 resolves last.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const VANGUARD_CAPTAIN = "ogn-218-298";
const DANGEROUS_DUO = "ogn-016-298";
const EN_GARDE = "ogn-046-298"; // Reaction · Calm · 1 — "Give a friendly unit +1 [Might] this turn, then an additional +1 … if it is the only unit you control there."
const FILLER = { cardType: "unit", energyCost: 3, might: 1, name: "Filler" } as const;

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn-2 main phase; nobody has played a card. P1: 5 energy + [mind] (exactly Promising Future) +
 * `order` order power (Captain's [order]); controls bf1 (held by a 2-Might P1 Holder). P2: 1 energy (En
 * Garde), controls bf2 (2-Might P2 Holder), En Garde in hand. Deck tops: Captain (P1), Duo (P2).
 */
function board(opts: { order?: number } = {}) {
  return scenario()
    .resources(P1, { energy: 5, power: { mind: 1, order: opts.order ?? 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "P1 Holder" }, "p1holder")
    .unit(P2, "bf2", { might: 2, name: "P2 Holder" }, "p2holder")
    .deck(P1, [VANGUARD_CAPTAIN, FILLER, FILLER, FILLER, FILLER, FILLER], ["captain", "a2", "a3", "a4", "a5", "a6"])
    .deck(P2, [DANGEROUS_DUO, FILLER, FILLER, FILLER, FILLER, FILLER], ["duo", "b2", "b3", "b4", "b5", "b6"])
    .hand(P1, PROMISING_FUTURE, "pf")
    .hand(P2, EN_GARDE, "engarde");
}

/** One observation of the game at a decision point. */
interface Snap {
  readonly seat?: string;
  readonly kind?: string;
  readonly context?: string;
  readonly prompt: string;
  readonly sourceCard?: string;
  readonly options: string[];
  readonly chain: string[];
  readonly duoZone: string;
  readonly captainZone: string;
  readonly recruits: number;
  readonly duoMight: number | null;
  readonly played: { p1: number; p2: number };
}

const recruitsAt = (game: Game, bf: string) => game.cardsAt(bf).filter((id) => game.state(id).name === "Recruit");

function snap(game: Game): Snap {
  const d = game.decision();
  const duoZone = game.zoneOf("duo");
  return {
    captainZone: game.zoneOf("captain"),
    chain: game.chain().map((c) => c.cardId),
    context: d?.kind === "action" ? d.context : undefined,
    duoMight: duoZone === "base" || duoZone.startsWith("battlefield-") ? game.state("duo").might : null,
    duoZone,
    kind: d?.kind,
    options: d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [],
    played: { p1: game.gameState.cardsPlayedThisTurn?.[P1] ?? 0, p2: game.gameState.cardsPlayedThisTurn?.[P2] ?? 0 },
    prompt: d?.prompt ?? "",
    recruits: recruitsAt(game, "bf1").length,
    seat: d?.seat,
    sourceCard: d?.source?.cardId,
  };
}

interface Line {
  /** P2 answers Promising Future itself with En Garde (variant d). */
  readonly p2ReactsToPF?: boolean;
  /** P2 casts En Garde in the first window it gets AFTER Duo is on the board (retroactivity probe). */
  readonly p2EnGardeAfterDuo?: boolean;
  /** Duo's +2 target if P2 is asked (default: Duo itself). */
  readonly duoTarget?: string;
}

/**
 * Cast Promising Future and play the whole line to P1's open main phase: P1 banishes Captain → bf1,
 * P2 banishes Duo → base, everyone otherwise passes. Returns a snapshot at EVERY decision point.
 */
async function runLine(game: Game, line: Line = {}): Promise<Snap[]> {
  const trace: Snap[] = [];
  await game.p1.cast("pf");
  if (line.p2ReactsToPF) {
    await game.p1.passPriority();
    trace.push(snap(game));
    await game.p2.cast("engarde", { targets: "p2holder" });
  }
  let enGardeUsedLate = false;
  for (let i = 0; i < 60; i++) {
    const s = snap(game);
    trace.push(s);
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action") {
      const duoOnBoard = s.duoZone === "base" || s.duoZone.startsWith("battlefield-");
      if (line.p2EnGardeAfterDuo && !enGardeUsedLate && d.seat === P2 && duoOnBoard && game.p2.can("cast", "engarde")) {
        enGardeUsedLate = true;
        await game.p2.cast("engarde", { targets: "p2holder" });
      } else {
        await game.acting().pass();
      }
    } else if (d.kind === "pick") {
      const has = (k: string) => d.options.some((o) => o.key === k || o.card === k);
      const want = ["captain", "duo", "battlefield-bf1", "base"].find(has);
      if (d.source?.cardId === "duo" && d.semantics === "target") {
        await game.p2.pick(line.duoTarget ?? "duo");
      } else if (want) {
        await game.seat(d.seat).pick(want);
      } else {
        break;
      }
    } else if (d.kind === "order") {
      await game.acceptTriggerOrder();
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).no();
    } else {
      break;
    }
  }
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return trace;
}

const onBoard = (z: string) => z === "base" || z.startsWith("battlefield-");
const firstIndex = (trace: Snap[], pred: (s: Snap) => boolean) => trace.findIndex(pred);

describe("Promising Future × Legion — P2's Dangerous Duo (off) vs P1's Vanguard Captain (on)", () => {
  // ── (a) P2's Duo: Legion OFF ────────────────────────────────────────────────────────────────────

  test("(a) Duo's Legion is OFF: PF and Captain were finalized by P1, P2 has finalized nothing — Duo enters P2's base with no 'When you play me': P2 is never asked for a +2 target and no Duo ability ever sits on the chain (812.1.c)", async () => {
    const game = await board().build();
    const trace = await runLine(game);
    expect(game.zoneOf("duo")).toBe("base");
    expect(game.state("duo")).toMatchObject({ controller: P2, isExhausted: true, might: 3, owner: P2 });
    // No target prompt for P2, ever.
    expect(trace.some((s) => s.seat === P2 && s.kind === "pick" && s.sourceCard === "duo" && /target/i.test(s.prompt))).toBe(false);
    // Once Duo is on the board nothing of Duo's is on the chain any more (its pending PLAY item is gone, no trigger replaced it).
    expect(trace.filter((s) => onBoard(s.duoZone)).every((s) => !s.chain.includes("duo"))).toBe(true);
    // Nobody got +2.
    for (const id of ["duo", "p1holder", "p2holder", "captain"]) {
      expect(game.state(id).might).toBe(game.state(id).baseMight);
    }
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2, [P2]: 1 });
  });

  test("(a) …and it cannot trigger retroactively: P2 casting En Garde LATER this turn (after Duo is already down) makes P2's count 2 but raises no Duo trigger / target prompt; Duo stays at 3", async () => {
    const game = await board().build();
    const trace = await runLine(game, { p2EnGardeAfterDuo: true });
    expect(game.zoneOf("engarde")).toBe("trash"); // it really was cast
    expect(game.gameState.cardsPlayedThisTurn?.[P2]).toBe(2);
    expect(trace.some((s) => s.seat === P2 && s.kind === "pick" && s.sourceCard === "duo" && /target/i.test(s.prompt))).toBe(false);
    expect(trace.filter((s) => onBoard(s.duoZone)).every((s) => !s.chain.includes("duo"))).toBe(true);
    expect(game.state("duo").might).toBe(3);
    expect(game.state("p2holder").might).toBe(4); // En Garde: +1, +1 (alone there)
  });

  // ── (b) P1's Captain: Legion ON via PF ──────────────────────────────────────────────────────────

  test("(b) Captain's Legion is ON — Promising Future itself is 'another card' P1 finalized this turn (812.1.c): the Captain's trigger goes on the chain and two Recruit tokens end up at bf1", async () => {
    const game = await board().build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    const trace = await runLine(game);
    // A Captain-sourced triggered ability was on the chain at some point after Captain entered.
    expect(trace.some((s) => onBoard(s.captainZone) && s.chain.includes("captain"))).toBe(true);
    expect(recruitsAt(game, "bf1")).toHaveLength(2);
  });

  // ── (c) full ordering ───────────────────────────────────────────────────────────────────────────

  test("(c) queue is next-player-first (354.3 / 303.2.a): after both banish picks P2 is asked to place Duo BEFORE P1 is asked to place Captain, and Duo is on the board while Captain is still banished", async () => {
    const game = await board().build();
    const trace = await runLine(game);
    const duoDest = firstIndex(trace, (s) => s.seat === P2 && s.kind === "pick" && s.sourceCard === "duo" && /destination/i.test(s.prompt));
    const capDest = firstIndex(trace, (s) => s.seat === P1 && s.kind === "pick" && s.sourceCard === "captain" && /destination/i.test(s.prompt));
    expect(duoDest).toBeGreaterThanOrEqual(0);
    expect(capDest).toBeGreaterThan(duoDest);
    expect(trace[capDest]).toMatchObject({ captainZone: "banishment", duoZone: "base" });
    // Both were banished (public) before either was played.
    expect(trace[duoDest]).toMatchObject({ captainZone: "banishment", duoZone: "banishment" });
  });

  test("(c) Duo: its 3 Energy is ignored and it has no Power cost — P2 (1 energy, no power) pays nothing; it enters P2's base exhausted under P2's control and counts as P2's one played card", async () => {
    const game = await board().build();
    await runLine(game);
    expect(game.p2.resources()).toEqual({ energy: 1, power: {} });
    expect(game.state("duo")).toMatchObject({ controller: P2, isExhausted: true, owner: P2, zone: "base" });
    expect(game.gameState.cardsPlayedThisTurn?.[P2]).toBe(1);
  });

  test("(c) Captain: Energy ignored (P1 is at 0 after PF) but the [order] is PAID from P1's pool (356.1.b.2): order 1 → 0; P1 may choose bf1 (a battlefield P1 controls) and Captain enters there exhausted", async () => {
    const game = await board().build();
    const trace = await runLine(game);
    const capDest = trace.find((s) => s.seat === P1 && s.kind === "pick" && s.sourceCard === "captain" && /destination/i.test(s.prompt));
    expect(capDest?.options.sort()).toEqual(["base", "battlefield-bf1"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0 } });
    expect(game.state("captain")).toMatchObject({ controller: P1, isExhausted: true, zone: "battlefield-bf1" });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2); // PF + Captain
  });

  test("(c) contrast — with NO order power P1 cannot pay Captain's [order]: the play is undone, Captain stays in P1's banishment, no trigger, no Recruits; Duo still resolves normally for P2", async () => {
    const game = await board({ order: 0 }).build();
    const trace = await runLine(game);
    expect(game.zoneOf("captain")).toBe("banishment");
    expect(recruitsAt(game, "bf1")).toEqual([]);
    expect(trace.some((s) => s.seat === P1 && s.kind === "pick" && s.sourceCard === "captain" && /destination/i.test(s.prompt))).toBe(false);
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 1, [P2]: 1 });
    expect(game.zoneOf("duo")).toBe("base");
  });

  // Expected (337.1.a / 337.2 / 337.3 / 337.4, 383.4.a.2): pending PLAYS are finalized one after another
  // without anyone receiving priority — Duo enters, Captain enters, Captain's trigger (the only Pending
  // item) is finalized, and only THEN does the first priority window open, with both units on the board
  // and the Captain trigger as the top item. Actual: the engine opens a full pass-around priority window
  // over each still-PENDING play item ("respond to Dangerous Duo" while Duo is in banishment, then again
  // for Captain), i.e. before the plays are even finalized.
  test("BUG: (c) no priority over PENDING plays — the first priority window after the picks opens with Duo AND Captain already on the board and Captain's trigger on top (337.4)", async () => {
    const game = await board().build();
    const trace = await runLine(game);
    const p2Pick = firstIndex(trace, (s) => s.seat === P2 && s.kind === "pick" && /banish/i.test(s.prompt));
    expect(p2Pick).toBeGreaterThanOrEqual(0);
    const firstPriority = trace.slice(p2Pick + 1).find((s) => s.kind === "action" && s.context === "chain");
    expect(firstPriority).toBeDefined();
    expect(onBoard(firstPriority?.duoZone ?? "")).toBe(true);
    expect(firstPriority?.captainZone).toBe("battlefield-bf1");
    expect(firstPriority?.chain.at(-1)).toBe("captain");
  });

  test("(c) Captain's trigger resolves: two 1-Might Recruit unit TOKENS are played 'here' = bf1 (never base), exhausted, owned and controlled by P1 — no target prompt, and no decision point ever sees just one of them (no priority between the two token plays)", async () => {
    const game = await board().build();
    const trace = await runLine(game);
    const recruits = recruitsAt(game, "bf1");
    expect(recruits).toHaveLength(2);
    for (const r of recruits) {
      expect(game.state(r)).toMatchObject({ controller: P1, isExhausted: true, isToken: true, might: 1, owner: P1, zone: "battlefield-bf1" });
    }
    expect(recruitsAt(game, "base")).toEqual([]);
    expect(game.p1.base().filter((id) => game.state(id).name === "Recruit")).toEqual([]);
    expect(trace.every((s) => s.recruits === 0 || s.recruits === 2)).toBe(true);
    expect(trace.some((s) => s.kind === "pick" && s.sourceCard === "captain" && /target/i.test(s.prompt))).toBe(false);
    expect(game.p1.units("bf1").sort()).toEqual(["captain", "p1holder", ...recruits].sort());
    expect(game.chain()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) P2 played a Reaction earlier this turn ──────────────────────────────────────────────────

  test("(d) P2 answered PF with En Garde → a card FINALIZED by P2 this turn: when Duo is then played its Legion is ON — P2 IS asked to choose a unit for +2, and the bonus lands (Duo 3 → 5 this turn)", async () => {
    const game = await board().build();
    const trace = await runLine(game, { duoTarget: "duo", p2ReactsToPF: true });
    expect(game.zoneOf("engarde")).toBe("trash");
    const ask = trace.find((s) => s.seat === P2 && s.kind === "pick" && s.sourceCard === "duo" && /target/i.test(s.prompt));
    expect(ask).toBeDefined();
    expect(onBoard(ask?.duoZone ?? "")).toBe(true); // asked only once Duo has entered (383.4.a.2)
    expect(ask?.options).toEqual(expect.arrayContaining(["duo", "p1holder", "p2holder"]));
    expect(game.state("duo").might).toBe(5);
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2, [P2]: 2 });
    // "this turn": gone after the turn passes.
    await game.advanceTurn();
    expect(game.state("duo").might).toBe(3);
  });

  // Expected (337.1.b oldest-Pending-first, 383.4.a.2, 355.5 / 355.9.a): Duo enters → Duo-trig is appended
  // BEHIND the still-pending Captain play; Captain is therefore finalized (enters bf1) before Duo-trig is
  // finalized, so when P2 picks Duo-trig's target the Captain is a unit on the board and must be offered.
  // Actual: the engine finalizes Duo's trigger (asks its target) immediately after Duo enters, while
  // Captain is still in banishment — Captain is missing from the options.
  test("BUG: (d) Captain — the older pending play — is on the board before Duo's trigger is finalized, so it is a legal '+2' target for P2 (355.5)", async () => {
    const game = await board().build();
    const trace = await runLine(game, { duoTarget: "duo", p2ReactsToPF: true });
    const ask = trace.find((s) => s.seat === P2 && s.kind === "pick" && s.sourceCard === "duo" && /target/i.test(s.prompt));
    expect(ask).toBeDefined();
    expect(ask?.captainZone).toBe("battlefield-bf1");
    expect(ask?.options).toContain("captain");
  });

  test("(d) the Recruit tokens do NOT exist when Duo's target is chosen (they are only created when Captain's trigger resolves) — no Recruit / token is among P2's options (355.9.a)", async () => {
    const game = await board().build();
    const trace = await runLine(game, { duoTarget: "duo", p2ReactsToPF: true });
    const ask = trace.find((s) => s.seat === P2 && s.kind === "pick" && s.sourceCard === "duo" && /target/i.test(s.prompt));
    expect(ask).toBeDefined();
    expect(ask?.recruits).toBe(0);
    expect(ask?.options.some((o) => /recruit|token/i.test(o))).toBe(false);
    expect(ask?.options.every((o) => ["duo", "p1holder", "p2holder", "captain"].includes(o))).toBe(true);
  });

  // Expected (340.1 LIFO over [Duo-trig, Captain-trig]): Captain's trigger is the top item and resolves
  // first — both Recruits are at bf1 by the time Duo's +2 is applied. Actual: the engine finalizes AND
  // resolves Duo's trigger before Captain's play is even finalized, so the +2 lands with 0 Recruits out.
  test("BUG: (d) LIFO — Captain's Recruits enter bf1 BEFORE Duo's +2 resolves (340.1)", async () => {
    const game = await board().build();
    const trace = await runLine(game, { duoTarget: "duo", p2ReactsToPF: true });
    const plusTwoLanded = trace.find((s) => s.duoMight === 5);
    expect(plusTwoLanded).toBeDefined();
    expect(plusTwoLanded?.recruits).toBe(2);
  });

  test("(d) end state: Duo (5 Might this turn) exhausted in P2's base, Captain + two Recruits + P1 Holder at bf1, P2 Holder at 4 from En Garde, both banishments empty, P1 0 energy / 0 order, P2 0 energy", async () => {
    const game = await board().build();
    await runLine(game, { duoTarget: "duo", p2ReactsToPF: true });
    expect(game.state("duo")).toMatchObject({ controller: P2, isExhausted: true, might: 5, zone: "base" });
    expect(game.state("captain")).toMatchObject({ controller: P1, isExhausted: true, zone: "battlefield-bf1" });
    expect(recruitsAt(game, "bf1")).toHaveLength(2);
    expect(game.p1.units("bf1")).toHaveLength(4);
    expect(game.state("p2holder").might).toBe(4);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0 } });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
