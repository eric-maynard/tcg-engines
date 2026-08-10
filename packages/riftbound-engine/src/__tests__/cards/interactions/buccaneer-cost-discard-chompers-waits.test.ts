/**
 * Interaction: Brazen Buccaneer (ogn-002-298) · Unit · Fury · [6] · 5 Might
 *     "As you play me, you may discard 1 as an additional cost. If you do, reduce my cost by [2]."
 *   × Flame Chompers (ogn-006-298) · Unit · Fury · [3] · 3 Might
 *     "When you discard me, you may pay [fury] to play me."
 *
 * Board: P1's turn, Neutral Open. Buccaneer + Chompers are P1's only hand cards; P1 controls bf1 (a Holder
 * unit keeps it). P2 has nothing relevant.
 *
 * Question:
 *   (a) offered-set matrix for opening the Buccaneer play: (i) 6 energy — discard offered as OPTIONAL?
 *       (ii) exactly 4 — offered at all, and is "don't discard" still selectable? (iii) 3 — offered?
 *       (iv) 4 but Buccaneer is the ONLY hand card — offered?
 *   (b) 4 energy + 1 fury: P1 plays Buccaneer to bf1 electing to discard Chompers. When exactly is Chompers
 *       discarded / when is its trigger finalized / when is P1 asked to pay [fury] — can any Chompers prompt
 *       appear before Buccaneer has finished finalizing and entered bf1? Does P2 get priority between
 *       Buccaneer landing and the pay decision?
 *   (c) P1 pays: what does Chompers cost beyond the fury, where may it go, how does it enter; final pools?
 *   (d) same as (b) with 0 fury: what prompt (if any); where is Chompers; did Buccaneer still cost 4?
 *
 * Expected:
 *   (a)(i) offered; discard is a genuine option (355.1.a): pay 6 keep Chompers, or discard and pay 4.
 *      (ii) offered, but ONLY the discard line (355.16 — declining would deterministically fail 358.2).
 *      (iii) not offered (even discounted it is 4; 419.2.a). (iv) not offered (nothing to discard).
 *   (b) inside the one play process: step 2 elect the cost + pick bf1 (355.1.a, 355.2.a); step 3 total 6−2=4
 *       (356.2.b.1, 356.4); step 4 discard Chompers hand→trash (422.1) and pay 4 (357.1/357.2). Chompers'
 *       trigger merely becomes pending (422.1.b / 354.4) — nothing is asked while Buccaneer's play is still
 *       running; Buccaneer leaves the chain and enters bf1 exhausted at once (359.2.c, 337.2). Only then is
 *       the pending trigger finalized (337.1.b/337.3) — with NO cost at finalization: the [fury] is inside the
 *       effect (ruling 5a88d5846ff45970) — P2 gets priority (337.4), all pass, it resolves and P1 is asked
 *       "pay [fury]?". Observable: Chompers in trash AND Buccaneer on the board AND energy 0 before the first
 *       Chompers-related decision; P2's window sits between Buccaneer landing and P1's pay decision.
 *   (c) paying: fury 1→0, no energy (the fury replaces the printed 3 — ruling 9d5976499289b276); locations
 *       {base, bf1} (355.2.a); enters exhausted (359.2.c). Final: energy 0, fury 0, both units on the board,
 *       hand empty, Chompers not in trash.
 *   (d) 0 fury: the trigger still goes on the chain (ruling c7536c4dddd9d5de) but on resolution "pay [fury]
 *       to" is unpayable → nothing happens and no yes/no is shown; Chompers stays in the trash; Buccaneer
 *       still cost exactly 4 (356.4.f.1).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BRAZEN_BUCCANEER = "ogn-002-298";
const FLAME_CHOMPERS = "ogn-006-298";

/** P1's turn: `energy` + `fury`; P1 controls bf1 via a 2-Might Holder; hand = Buccaneer (+ Chompers). */
function board(energy: number, fury = 1, withChompers = true) {
  const s = scenario()
    .resources(P1, { energy, power: { fury } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .hand(P1, BRAZEN_BUCCANEER, "bb");
  if (withChompers) {
    s.hand(P1, FLAME_CHOMPERS, "fc");
  }
  return s;
}

interface OfferedLines {
  offered: boolean;
  /** distinct `paidAdditionalCost` values across the legal variants (undefined = plain line). */
  discardChoices: (boolean | undefined)[];
  /** distinct locations across the legal variants, per line. */
  plainLocations: string[];
  discardLocations: string[];
}

/** What the engine offers for opening the Buccaneer play right now. */
function offered(game: Game): OfferedLines {
  const opt = game.p1.option("playUnit", "bb");
  const variants = opt?.variants ?? [];
  const paid = (v: (typeof variants)[number]): boolean => v.params.paidAdditionalCost === true;
  const loc = (v: (typeof variants)[number]): string => String(v.params.location);
  return {
    discardChoices: [...new Set(variants.map((v) => (paid(v) ? true : undefined)))],
    discardLocations: [...new Set(variants.filter(paid).map(loc))].sort(),
    offered: opt !== undefined && game.p1.can("play", "bb"),
    plainLocations: [...new Set(variants.filter((v) => !paid(v)).map(loc))].sort(),
  };
}

const isChompersDecision = (d: Decision | null): boolean =>
  d !== null && d.kind !== "action" && d.seat === P1 && d.source?.cardId === "fc";
const isOpenMain = (d: Decision | null): boolean => d?.kind === "action" && d.context === "main";
/** The harness `costPaid` invariant compares the pool delta with the PRINTED 6 and does not know the [2] discount. */
const realViolations = (game: Game) => game.violations().filter((v) => v.invariant !== "costPaid");

/**
 * (b) P1 (4 energy + `fury`) plays Buccaneer electing the discard (Chompers). The rules answer plays it to bf1;
 * the engine only offers the discard line to BASE (see the BUG test), so the timing facets use base.
 */
async function playedWithDiscard(fury: number): Promise<Game> {
  const game = await board(4, fury).build();
  await game.p1.play("bb", { discard: "fc", payOptional: true, to: "base" });
  return game;
}

/**
 * Drive every prompt from the Buccaneer play to the open main phase, paying for Chompers when asked and
 * sending it to bf1. Records the (seat, kind, context, source) of every decision in order.
 */
async function driveChompers(game: Game): Promise<string[]> {
  const log: string[] = [];
  for (let i = 0; i < 30; i++) {
    const d = game.decision();
    if (!d || isOpenMain(d)) {
      break;
    }
    log.push(`${d.seat}:${d.kind}${d.kind === "action" ? `(${d.context})` : ""}${d.source?.cardId ? `@${d.source.cardId}` : ""}`);
    if (d.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => o.key === "battlefield-bf1" || o.key === "bf1")) {
      await game.p1.pick(d.options.some((o) => o.key === "battlefield-bf1") ? "battlefield-bf1" : "bf1");
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      const r = await game.settle({ maxSteps: 1 });
      if (r.reason === "unanswered") {
        break;
      }
    }
  }
  return log;
}

describe("Brazen Buccaneer's optional discard × Flame Chompers — the discard trigger waits for the play to finish", () => {
  // ── (a) offered-set matrix ──────────────────────────────────────────────────────────────────

  test("(a)(i) 6 energy: Buccaneer is offered with the discard as a genuine OPTION — a plain line (pay 6, keep Chompers) and a discard line (pay 4) both exist (355.1.a)", async () => {
    const game = await board(6).build();
    const o = offered(game);
    expect(o.offered).toBe(true);
    expect(o.discardChoices.sort()).toEqual([true, undefined]);
    // plain line: full 6, Chompers kept
    await game.p1.play("bb", { payOptional: false, to: "bf1" });
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("fc")).toBe("hand");
    expect(game.zoneOf("bb")).toBe("battlefield-bf1");
    // discard line: 4, Chompers discarded
    const alt = await board(6).build();
    await alt.p1.play("bb", { discard: "fc", payOptional: true, to: "base" });
    expect(alt.p1.energy()).toBe(2);
    expect(alt.zoneOf("fc")).toBe("trash");
  });

  test("(a)(ii) exactly 4 energy: Buccaneer IS offered, but only in its discard form — 'don't discard' is absent rather than accepted-then-bounced (355.16, 358.2)", async () => {
    const game = await board(4).build();
    const o = offered(game);
    expect(o.offered).toBe(true);
    expect(o.discardChoices).toEqual([true]);
    expect(o.plainLocations).toEqual([]);
    const field = game.p1.option("playUnit", "bb")?.fields.find((f) => f.arg === "payOptional");
    expect(field?.options).toEqual([true]);
    expect((await game.p1.try((p) => p.play("bb", { payOptional: false, to: "base" }))).ok).toBe(false);
    expect(game.zoneOf("bb")).toBe("hand");
    expect(game.p1.energy()).toBe(4);
  });

  test("(a)(iii) 3 energy: not offered at all — even discounted the Buccaneer costs 4 (419.2.a)", async () => {
    const game = await board(3).build();
    expect(offered(game).offered).toBe(false);
    expect(game.p1.can("play", "bb")).toBe(false);
    expect((await game.p1.try((p) => p.play("bb", { discard: "fc", payOptional: true, to: "base" }))).ok).toBe(false);
    expect(game.zoneOf("bb")).toBe("hand");
    expect(game.zoneOf("fc")).toBe("hand");
  });

  test("(a)(iv) 4 energy with Buccaneer as the ONLY hand card: not offered — the only affordable line needs a discard that cannot be made", async () => {
    const game = await board(4, 1, false).build();
    expect(game.p1.hand()).toEqual(["bb"]);
    expect(offered(game).offered).toBe(false);
    expect(game.p1.can("play", "bb")).toBe(false);
  });

  // ── (b) the play process vs. the pending discard trigger ────────────────────────────────────

  test.failing("BUG: (b) the discard line may be played to bf1, a battlefield P1 controls (355.2.a) — with 4 energy + 1 fury `play(bb → bf1, discard Chompers)` is legal and lands Buccaneer at bf1 for 4", async () => {
    // Expected: valid locations for the discounted play are {base, bf1} exactly as for the plain play.
    // Actual: the engine enumerates the paid-additional-cost variant with location "base" only, so the
    // bf1 discard play is rejected (the plain 6-energy play does offer bf1).
    const six = await board(6).build();
    expect(offered(six).discardLocations).toEqual(["base", "battlefield-bf1"]);
    const game = await board(4).build();
    await game.p1.play("bb", { discard: "fc", payOptional: true, to: "bf1" });
    expect(game.zoneOf("bb")).toBe("battlefield-bf1");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("fc")).toBe("trash");
  });

  test("(b) the whole Buccaneer play is ONE executed move: by the time the first Chompers-related decision exists, Chompers is already in the trash (422.1), Buccaneer is already on the board exhausted (359.2.c, 337.2), energy is 0 and the hand is empty", async () => {
    const game = await board(4).build();
    const r = await game.p1.play("bb", { discard: "fc", payOptional: true, to: "base" });
    expect(r.executed.map((m) => m.moveId)).toEqual(["playUnit"]);
    // first decision after the play — whatever it is — sees the finished play
    expect(game.zoneOf("fc")).toBe("trash");
    expect(game.zoneOf("bb")).toBe("base");
    expect(game.state("bb")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.hand()).toEqual([]);
    expect(game.chain().some((c) => c.cardId === "bb")).toBe(false); // Buccaneer is not lingering on the chain
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fc", controller: P1, triggered: true })]);
  });

  // RULING-CONFLICT: riftjudge 5a88d5846ff45970 says the Chompers trigger is finalized with no cost and the
  // "pay [fury]?" question comes at RESOLUTION (after P2's priority window); CR 383.3.a/383.3.b + 204.3.a say a
  // leading "you may pay [C] TO Y" is the trigger's BASE COST, opted into and paid at FINALIZATION — engine
  // follows CR (see core-rules/optional-instructions-timing.test.ts; the resolution-side rulings all predate the
  // Unleashed CR). P2's window still sits between Buccaneer landing and Chompers reaching the board.
  test("(b) the Chompers trigger is a cost-at-finalization 'you may pay [fury] TO play me': P1 is asked BEFORE anyone gets priority and the fury is paid on accept (383.3.a/383.3.b, 204.3.a); only then does the chain window open", async () => {
    const game = await playedWithDiscard(1);
    expect(game.zoneOf("fc")).toBe("trash");
    expect(game.zoneOf("bb")).toBe("base"); // Buccaneer already landed (359.2.c, 337.2)
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "fc" }, timing: "FIN" });
    expect(game.p1.power("fury")).toBe(1);
    await game.p1.yes();
    expect(game.p1.power("fury")).toBe(0); // 383.3.b — the base cost is paid at finalization
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fc", controller: P1, triggered: true })]);
    expect((game.gameState.interaction?.chain?.items ?? []).map((it) => it.mayKind)).toEqual(["cost-at-finalization"]);
    // 337.4 — P2 gets a priority window on the finalized item, before Chompers reaches the board.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.zoneOf("fc")).toBe("trash");
  });

  test("(b) whatever the internal order, P2 DOES receive a priority window on the Chompers item after Buccaneer has landed and before Chompers reaches the board", async () => {
    const game = await playedWithDiscard(1);
    const log = await driveChompers(game);
    const p2Window = log.findIndex((e) => e.startsWith(`${P2}:action(chain)`));
    expect(p2Window).toBeGreaterThanOrEqual(0);
    // Buccaneer was on the board from the very first logged decision (checked in the test above); Chompers only
    // reaches the board after P2's window: every decision up to and including it still had Chompers off-board.
    expect(log.slice(0, p2Window + 1).some((e) => e.includes("pick"))).toBe(false); // destination not yet asked
    expect(isOpenMain(game.decision())).toBe(true);
  });

  // ── (c) paying ──────────────────────────────────────────────────────────────────────────────

  test("(c) P1 pays: exactly [fury] (1→0) and NO energy for the printed 3; Chompers may go to base OR bf1 (355.2.a) — sent to bf1 it enters EXHAUSTED (359.2.c); final: energy 0, fury 0, Buccaneer + Chompers on the board, hand empty, Chompers no longer in the trash, chain empty", async () => {
    const game = await playedWithDiscard(1);
    let destinations: string[] = [];
    for (let i = 0; i < 30 && !isOpenMain(game.decision()); i++) {
      const d = game.decision() as Decision;
      if (d.kind === "yes-no" && d.seat === P1) {
        expect(d.canAccept).not.toBe(false);
        await game.p1.yes();
      } else if (d.kind === "pick" && d.seat === P1 && d.source?.cardId === "fc") {
        destinations = d.options.map((o) => o.key).sort();
        await game.p1.pick("battlefield-bf1");
      } else {
        await game.settle({ maxSteps: 1 });
      }
    }
    expect(destinations).toEqual(["base", "battlefield-bf1"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("bb")).toBe("base");
    expect(game.zoneOf("fc")).toBe("battlefield-bf1");
    expect(game.state("fc")).toMatchObject({ controller: P1, isExhausted: true, might: 3 });
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.trash()).not.toContain("fc");
    expect(game.chain()).toEqual([]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2); // two unit plays (ruling 175a37156f5944ce)
    expect(isOpenMain(game.decision())).toBe(true);
    expect(game.decision()?.seat).toBe(P1);
    expect(realViolations(game)).toEqual([]);
  });

  test("(c, NO) declining to pay leaves Chompers in the trash and the fury unspent; Buccaneer still cost exactly 4", async () => {
    const game = await playedWithDiscard(1);
    for (let i = 0; i < 30 && !isOpenMain(game.decision()); i++) {
      const d = game.decision() as Decision;
      if (d.kind === "yes-no" && d.seat === P1) {
        await game.p1.no();
      } else {
        await game.settle({ maxSteps: 1 });
      }
    }
    expect(game.zoneOf("fc")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    expect(game.zoneOf("bb")).toBe("base");
    expect(game.chain()).toEqual([]);
  });

  // ── (d) no fury ─────────────────────────────────────────────────────────────────────────────

  test("(d) 0 fury: the discard trigger STILL goes on the chain as P1's item (ruling c7536c4dddd9d5de); Buccaneer cost exactly 4 and is on the board; Chompers is in the trash", async () => {
    const game = await playedWithDiscard(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fc", controller: P1, triggered: true })]);
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("bb")).toBe("base");
    expect(game.zoneOf("fc")).toBe("trash");
  });

  test.failing("BUG: (d) 0 fury: no yes/no is ever shown — the item gets its priority window and on resolution the unpayable 'pay [fury] to' simply does nothing", async () => {
    // Expected: never a P1 yes/no about Chompers; after both pass the chain is empty and Chompers is in the trash.
    // Actual: the engine raises a finalization-time yes/no ("Pay [fury] …?", canAccept:false) before any priority.
    const game = await playedWithDiscard(0);
    let sawYesNo = false;
    for (let i = 0; i < 30 && !isOpenMain(game.decision()); i++) {
      const d = game.decision() as Decision;
      sawYesNo ||= d.kind === "yes-no" && isChompersDecision(d);
      if (d.kind === "yes-no" && d.seat === P1) {
        await game.p1.no();
      } else {
        await game.settle({ maxSteps: 1 });
      }
    }
    expect(game.zoneOf("fc")).toBe("trash");
    expect(sawYesNo).toBe(false);
  });

  test("(d) 0 fury, end state: 'yes' is not a legal answer at any point; Chompers remains in P1's trash, pools energy 0 / fury 0, Buccaneer (cost 4 — the optional cost counts as paid because the discard was made, 356.4.f.1) on the board, back to P1's open main phase", async () => {
    const game = await playedWithDiscard(0);
    for (let i = 0; i < 30 && !isOpenMain(game.decision()); i++) {
      const d = game.decision() as Decision;
      if (d.kind === "yes-no" && d.seat === P1) {
        expect(d.canAccept).toBe(false);
        expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
        await game.p1.no();
      } else {
        await game.settle({ maxSteps: 1 });
      }
    }
    expect(isOpenMain(game.decision())).toBe(true);
    expect(game.decision()?.seat).toBe(P1);
    expect(game.zoneOf("fc")).toBe("trash");
    expect(game.p1.trash()).toContain("fc");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("bb")).toBe("base");
    expect(game.state("bb").might).toBe(5);
    expect(game.p1.hand()).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(realViolations(game)).toEqual([]);
  });
});
