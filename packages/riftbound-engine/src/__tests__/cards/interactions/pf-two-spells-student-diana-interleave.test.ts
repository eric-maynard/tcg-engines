/**
 * Interaction: Promising Future (ogn-115-298) · Spell · Mind · 5+[mind]
 *     "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the rest.
 *      Starting with the next player, each player plays those cards, ignoring Energy costs."
 *   × Ravenbloom Student (ogn-103-298) · Unit · Mind · 2 · 2 Might — "When you play a spell, give me +1 [Might] this turn."
 *   × Diana, No Longer Human (unl-149-219) · Unit · Chaos · 4 · 3 Might — "When you play a spell, give me +2 [Might] this turn."
 *   with both players flipping Stupefy (ogn-095-298) · Spell · 1 · [Reaction]
 *     "Give a unit −1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *
 * Rules: 419.4.a / 350.1 (a card is "played" — and play-triggers fire — only when it finishes resolving; for
 * the player who played it), 419.4.a.1 (countered → never played), 354.3 + 303.2.a (plays instructed mid-
 * resolution are queued as Pending items, next player first), 383.2.c (a trigger created by PF completing is
 * appended after what PF queued), 337.1 / 337.1.a / 337.1.b (Pending items are finalized oldest-first, no
 * priority in between), 355.5 (a spell's chosen target is fixed at finalization), 356.1.b.2 (Energy zeroed →
 * Stupefy is free), 337.4 / 340.4 (priority only once nothing is Pending), 340.1 (newest resolves first).
 *
 * Q: P1's turn; P1 has Student (2), P2 has Diana (3). P1 casts PF; both banish Stupefy. P2 aims at Student,
 *    P1 aims at Diana.
 *   (a) PF creates only STUDENT's trigger (P1 played PF; "you" ≠ P2). It is appended AFTER the two queued
 *       Stupefys: chain oldest→newest = [Stupefy-P2, Stupefy-P1, Student-trig(PF)].
 *   (b) P2 finalizes (chooses Student) first, then P1 (chooses Diana) — P2 commits blind.
 *   (c) First priority only after all three are finalized.
 *   (d) Resolve newest-first: Student-trig(PF) → Student 3. P1's Stupefy → Diana 2, P1 draws; P1 "played a
 *       spell" → new Student trigger → Student 4. P2's Stupefy → Student 3, P2 draws; Diana triggers → 4.
 *       End: Student 3, Diana 4, each drew 1, chain empty.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";
const DIANA = "unl-149-219";
const STUPEFY = "ogn-095-298";
const FILLER = { cardType: "unit", energyCost: 3, might: 1, name: "Filler" } as const;

/**
 * P1's turn with exactly PF's cost. Student in P1's base, Diana in P2's base (Stupefy says "a unit" — location
 * is irrelevant). A Stupefy tops each deck (aliases stupP1 / stupP2); after PF recycles the other four, the 6th
 * card (a6 / b6) is what "Draw 1" will draw. Both hands are otherwise empty so draws are countable.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { mind: 1 } })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P2, "base", DIANA, "diana")
    .deck(P1, [STUPEFY, FILLER, FILLER, FILLER, FILLER, FILLER], ["stupP1", "a2", "a3", "a4", "a5", "a6"])
    .deck(P2, [STUPEFY, FILLER, FILLER, FILLER, FILLER, FILLER], ["stupP2", "b2", "b3", "b4", "b5", "b6"])
    .hand(P1, PROMISING_FUTURE, "pf");
}

/** Step (passes / forced answers only) until `pred` holds for the current decision. */
async function until(game: Game, pred: (d: Decision | null) => boolean, max = 30): Promise<Decision | null> {
  for (let i = 0; i < max; i++) {
    const d = game.decision();
    if (pred(d)) {
      return d;
    }
    const r = await game.settle({ maxSteps: 1 });
    if (r.reason !== "max-steps" && !pred(game.decision())) {
      break;
    }
  }
  const d = game.decision();
  expect(pred(d)).toBe(true);
  return d;
}

const isPickFor = (seat: Seat, re: RegExp) => (d: Decision | null) => d?.kind === "pick" && d.seat === seat && re.test(d.prompt);
const isTargetPick = (d: Decision | null) => d?.kind === "pick" && /target/i.test(d.prompt);
const isChainPriority = (d: Decision | null) => d?.kind === "action" && d.context === "chain";
const isOpenMain = (d: Decision | null) => d?.kind === "action" && d.context === "main";

/** Cast PF, let it start resolving, and make both banish picks: P1 → stupP1, then P2 → stupP2. */
async function castAndBanish(game: Game): Promise<void> {
  await game.p1.cast("pf");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  await until(game, isPickFor(P1, /banish/i));
  await game.p1.pick("stupP1");
  await until(game, isPickFor(P2, /banish/i));
  await game.p2.pick("stupP2");
  expect(game.zoneOf("pf")).toBe("trash");
}

interface Snap {
  readonly ev: "target-pick" | "priority" | "other" | "open";
  readonly seat?: Seat;
  readonly chain: readonly { cardId: string; controller: Seat; triggered: boolean; targets?: readonly string[] }[];
  readonly student: number;
  readonly diana: number;
  readonly stupP1: string;
  readonly stupP2: string;
  readonly p1Hand: number;
  readonly p2Hand: number;
}

function snap(game: Game, ev: Snap["ev"], seat?: Seat): Snap {
  return {
    chain: game.chain().map((c) => ({ cardId: c.cardId, controller: c.controller, targets: c.targets, triggered: c.triggered })),
    diana: game.state("diana").might,
    ev,
    p1Hand: game.p1.hand().length,
    p2Hand: game.p2.hand().length,
    seat,
    student: game.state("student").might,
    stupP1: game.zoneOf("stupP1"),
    stupP2: game.zoneOf("stupP2"),
  };
}

/**
 * From just after the banish picks: pass every priority, answer each Stupefy target prompt (P2 → Student,
 * P1 → Diana) whenever the engine asks it, and record a snapshot at every decision until P1's open main phase.
 */
async function playOut(game: Game): Promise<Snap[]> {
  const log: Snap[] = [];
  for (let i = 0; i < 60; i++) {
    const d = game.decision();
    if (isOpenMain(d)) {
      log.push(snap(game, "open", d!.seat));
      break;
    }
    if (isTargetPick(d)) {
      log.push(snap(game, "target-pick", d!.seat));
      await game.seat(d!.seat).pick(d!.seat === P2 ? "student" : "diana");
      continue;
    }
    log.push(snap(game, isChainPriority(d) ? "priority" : "other", d?.seat));
    await game.settle({ maxSteps: 1 });
  }
  expect(isOpenMain(game.decision())).toBe(true);
  return log;
}

describe("Promising Future flips two Stupefys × Ravenbloom Student / Diana — who triggers, when, and in what order", () => {
  // ── (a) which trigger PF itself creates, and where it sits ───────────────────────────────────
  test("(a) PF creates exactly ONE 'when you play a spell' trigger — Student's, controlled by P1; Diana (P2 didn't play PF) is silent", async () => {
    const game = await board().build();
    await castAndBanish(game);
    const trig = game.chain().filter((c) => c.triggered && (c.cardId === "student" || c.cardId === "diana"));
    expect(trig).toEqual([expect.objectContaining({ cardId: "student", controller: P1 })]);
    expect(game.state("diana").might).toBe(3);
    // and both Stupefys are queued as plays, one per player
    expect(game.chain().filter((c) => c.cardId === "stupP1")).toEqual([expect.objectContaining({ controller: P1 })]);
    expect(game.chain().filter((c) => c.cardId === "stupP2")).toEqual([expect.objectContaining({ controller: P2 })]);
  });

  test("(a) sanity: Diana's ability IS live — when P2 plays a spell on P2's own turn she gets +2 (so her silence for PF is about 'you', not a dead ability)", async () => {
    const game = await scenario().active(P2).resources(P2, { energy: 1 }).unit(P1, "base", RAVENBLOOM_STUDENT, "student").unit(P2, "base", DIANA, "diana").hand(P2, STUPEFY, "st").build();
    await game.p2.cast("st", { targets: "student" });
    await game.settle();
    expect(game.state("diana").might).toBe(5);
    expect(game.state("student").might).toBe(1); // 2 − 1; Student did not trigger off P2's spell
  });

  // BUG — expected (419.4.a, 350.1, 354.3, 383.2.c): PF is "played" only once it has finished resolving, i.e.
  // after both Stupefys were queued; Student's trigger is therefore the NEWEST item: [stupP2, stupP1, student].
  // Actual: the engine creates Student's trigger as PF starts resolving (before the banish picks), making it
  // the OLDEST item, and lists P1's Stupefy before P2's.
  test("BUG: (a) chain order oldest→newest right after the picks is [Stupefy-P2, Stupefy-P1, Student-trig(PF)] — engine appends Student's PF trigger first (oldest)", async () => {
    const game = await board().build();
    await castAndBanish(game);
    expect(game.chain().map((c) => c.cardId)).toEqual(["stupP2", "stupP1", "student"]);
  });

  // ── (b) finalization order ───────────────────────────────────────────────────────────────────
  // BUG — expected (337.1/337.1.b, 355.5): Pending plays are finalized in append order with targets chosen at
  // finalization — P2 is asked for their Stupefy's target FIRST, then P1, both before any priority window.
  // Actual: the engine asks each Stupefy's target only when that spell RESOLVES (P1's first), after several
  // priority windows.
  test("BUG: (b) P2 chooses their Stupefy's target first, then P1 — and no one has had priority before both targets are locked", async () => {
    const game = await board().build();
    await castAndBanish(game);
    const log = await playOut(game);
    const picks = log.filter((s) => s.ev === "target-pick").map((s) => s.seat);
    expect(picks).toEqual([P2, P1]);
    const firstPriority = log.findIndex((s) => s.ev === "priority");
    const secondPick = log.map((s) => s.ev).lastIndexOf("target-pick");
    expect(firstPriority).toBeGreaterThan(secondPick);
  });

  // ── (c) first priority window ────────────────────────────────────────────────────────────────
  // BUG — expected (337.1.a, 337.4): the first priority window opens with all three items Finalized — both
  // Stupefys carrying their targets (stupP2 → Student, stupP1 → Diana) under Student-trig(PF). Actual: the
  // first window opens with both Stupefys still un-targeted Pending plays.
  test("BUG: (c) at the FIRST priority window the chain is [stupP2→student, stupP1→diana, student-trig], all finalized", async () => {
    const game = await board().build();
    await castAndBanish(game);
    const log = await playOut(game);
    const first = log.find((s) => s.ev === "priority");
    expect(first).toBeDefined();
    expect(first!.chain).toEqual([
      expect.objectContaining({ cardId: "stupP2", controller: P2, targets: ["student"] }),
      expect.objectContaining({ cardId: "stupP1", controller: P1, targets: ["diana"] }),
      expect.objectContaining({ cardId: "student", controller: P1, triggered: true }),
    ]);
  });

  // ── (d) resolution order and the later triggers ──────────────────────────────────────────────
  test("(d) between the two flipped spells, P1's Stupefy (queued second = newer) resolves BEFORE P2's: Diana is at 2 and P1 has drawn while P2's Stupefy is still unresolved", async () => {
    const game = await board().build();
    await castAndBanish(game);
    const log = await playOut(game);
    const i1 = log.findIndex((s) => s.stupP1 === "trash");
    const i2 = log.findIndex((s) => s.stupP2 === "trash");
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThan(i1);
    const at = log[i1]!;
    expect(at.diana).toBe(2); // 3 − 1
    expect(at.p1Hand).toBe(1); // P1 drew a6
    expect(at.p2Hand).toBe(0);
    expect(at.stupP2).not.toBe("trash");
  });

  // rule 340.1: Student-trig(PF) is the NEWEST item, so it resolves first — Student is already 3 while both
  // Stupefys still sit on the chain. Read one step BEFORE P1's Stupefy hits the trash: that resolution at once
  // appends a FRESH Student trigger (next case), so the only window with no Student item on the chain is
  // between the PF trigger resolving and P1's Stupefy resolving.
  test("(d) Student-trig(PF) resolves before either Stupefy — Student is 3 at the moment P1's Stupefy resolves", async () => {
    const game = await board().build();
    await castAndBanish(game);
    const log = await playOut(game);
    const i1 = log.findIndex((s) => s.stupP1 === "trash");
    expect(i1).toBeGreaterThan(0);
    expect(log[i1]!.student).toBe(3);
    const before = log[i1 - 1]!;
    expect(before.student).toBe(3); // the PF trigger already resolved
    expect(before.chain.some((c) => c.cardId === "student" && c.triggered)).toBe(false); // already gone
    expect(before.chain.map((c) => c.cardId)).toEqual(["stupP2", "stupP1"]);
  });

  // BUG — expected (419.4.a): P1's Stupefy finishing = P1 played a spell → a NEW Student trigger (P1's) becomes
  // Pending, is finalized, and resolves (+1) before P2's Stupefy does. Actual: spells played via PF's
  // "play those cards" never fire play-a-spell triggers — no Student item appears, no +1.
  test("(d) P1's flipped Stupefy resolving triggers Student again (+1) — a fresh P1 Student item appears right after it and Student has gained before P2's Stupefy resolves", async () => {
    const game = await board().build();
    await castAndBanish(game);
    const log = await playOut(game);
    const i1 = log.findIndex((s) => s.stupP1 === "trash");
    const i2 = log.findIndex((s) => s.stupP2 === "trash");
    const studentItems = (s: Snap) => s.chain.filter((c) => c.cardId === "student" && c.triggered && c.controller === P1).length;
    const between = log.slice(i1, i2);
    // A Student item that was not there just before P1's Stupefy resolved.
    expect(Math.max(...between.map(studentItems))).toBeGreaterThan(studentItems(log[i1 - 1]!));
    // Student: 2 +1 (PF) +1 (P1's Stupefy) = 4 just before P2's Stupefy knocks it to 3.
    expect(log[i2 - 1]!.student).toBe(4);
  });

  // BUG — expected (419.4.a): P2's Stupefy finishing = P2 played a spell → Diana triggers (+2): 3 − 1 + 2 = 4.
  // Actual: no Diana trigger for a PF-flipped spell; Diana ends at 2.
  test("BUG: (d) P2's flipped Stupefy resolving triggers Diana (+2) — a P2 Diana item appears after it and Diana ends at 4", async () => {
    const game = await board().build();
    await castAndBanish(game);
    const log = await playOut(game);
    const i2 = log.findIndex((s) => s.stupP2 === "trash");
    expect(log.slice(i2).some((s) => s.chain.some((c) => c.cardId === "diana" && c.triggered && c.controller === P2))).toBe(true);
    expect(game.state("diana").might).toBe(4);
  });

  test("(d) Student never triggers off P2's spell and Diana never off P1's: no P2-controlled Student item or P1-controlled Diana item ever appears", async () => {
    const game = await board().build();
    await castAndBanish(game);
    const log = await playOut(game);
    for (const s of log) {
      expect(s.chain.some((c) => c.cardId === "student" && c.triggered && c.controller === P2)).toBe(false);
      expect(s.chain.some((c) => c.cardId === "diana" && c.triggered && c.controller === P1)).toBe(false);
    }
  });

  test("(d) bookkeeping that already holds: both Stupefys end in their owners' trash, each player drew exactly 1 (a6 / b6), P1 paid nothing extra, chain empty, P1's open main phase", async () => {
    const game = await board().build();
    await castAndBanish(game);
    await playOut(game);
    expect(game.zoneOf("stupP1")).toBe("trash");
    expect(game.zoneOf("stupP2")).toBe("trash");
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["pf", "stupP1"]));
    expect(game.p2.trash()).toEqual(["stupP2"]);
    expect(game.p1.hand()).toEqual(["a6"]);
    expect(game.p2.hand()).toEqual(["b6"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // Stupefy's 1 Energy ignored (356.1.b.2)
    expect(game.p2.energy()).toBe(0);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2, [P2]: 1 });
    expect(game.violations()).toEqual([]);
  });

  // BUG — expected end state: Student 3 (2 +1 +1 −1), Diana 4 (3 −1 +2). Actual: Student 2 (2 −1 +1: only the
  // PF trigger, resolving last), Diana 2 (3 −1: never triggers).
  test("(d) final Might — Ravenbloom Student 3, Diana 4", async () => {
    const game = await board().build();
    await castAndBanish(game);
    await playOut(game);
    expect([game.state("student").might, game.state("diana").might]).toEqual([3, 4]);
  });
});
