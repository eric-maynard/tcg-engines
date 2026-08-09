/**
 * Interaction: Promising Future (ogn-115-298) · Spell · Mind · 5+[mind]
 *     "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the rest.
 *      Starting with the next player, each player plays those cards, ignoring Energy costs."
 *   × Vex, Apathetic (unl-150-219) · Unit · Chaos · 4 · 4 Might · [Deflect]
 *     "When an opponent plays a unit while I'm at a battlefield, [Stun] it. They can't move it this turn."
 *   × Dune Drake (ogn-131-298) · Unit · Body · 5 · 5 Might (vanilla for this purpose)
 *
 * Rules: 354.3 + 303.2.a (plays instructed during a resolving spell are queued as Pending items, next player
 * first), 337.1.b (finalized in append order), 337.2 (a unit resolves immediately on finalization), 337.1.a /
 * 337.3 / 337.4 (no priority until nothing is Pending), 359.2.a, 419.4.a (a "when … plays a unit" trigger is
 * evaluated when the play completes), 383.2.c + 384.2 + 365.1 (a permanent's trigger condition is evaluated
 * only while it is on the board, after the event — no look-back), 383.2.a.1 ("while I'm at a battlefield" is
 * part of the condition), 355.10.d ("it" = the played unit — determined, not chosen → no target prompt, Deflect
 * irrelevant), 143.4 (units enter exhausted).
 *
 * Q / expected:
 *   Case A — P1's turn, P1 casts PF; P1 banishes Dune Drake, P2 banishes Vex and plays her to bf2 (P2's).
 *            Order is [Vex (P2 = next player), Drake (P1)]: Vex is placed first and is live at bf2 when Drake
 *            enters → her trigger is appended (P2's, no target chosen) → first priority → resolves: Drake is
 *            Stunned and can't be moved this turn.
 *   Case B — P2's turn, P2 casts PF; same flips. Order is [Drake (P1 = next player), Vex (P2)]: Drake enters
 *            while Vex is still a Pending item in banishment → nothing triggers; Vex then enters; no stun.
 *   Case C — as A but P2 puts Vex in her base → "while I'm at a battlefield" is false → no trigger.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const VEX = "unl-150-219";
const DUNE_DRAKE = "ogn-131-298";
const FILLER = { cardType: "unit", energyCost: 3, might: 1, name: "Filler" } as const;

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * `caster`'s turn with exactly PF's cost (5 + [mind]). Each player controls one battlefield with a 2-Might
 * holder (so "a battlefield you control" exists for both). Dune Drake tops P1's deck, Vex tops P2's.
 * Neither flipped unit has a Power cost, so both are free under PF.
 */
function board(caster: Seat) {
  return scenario()
    .active(caster)
    .resources(caster, { energy: 5, power: { mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "P1 Holder" }, "p1holder")
    .unit(P2, "bf2", { might: 2, name: "P2 Holder" }, "p2holder")
    .deck(P1, [DUNE_DRAKE, FILLER, FILLER, FILLER, FILLER, FILLER], ["drake", "a2", "a3", "a4", "a5", "a6"])
    .deck(P2, [VEX, FILLER, FILLER, FILLER, FILLER, FILLER], ["vex", "b2", "b3", "b4", "b5", "b6"])
    .hand(caster, PROMISING_FUTURE, "pf");
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
const isDestinationPick = (d: Decision | null) => d?.kind === "pick" && /destination/i.test(d.prompt);
const isChainPriority = (d: Decision | null) => d?.kind === "action" && d.context === "chain";
const isOpenMain = (d: Decision | null) => d?.kind === "action" && d.context === "main";

/** Cast PF as `caster`, let it resolve, and make both banish picks (caster first): P1 → Drake, P2 → Vex. */
async function castAndBanish(game: Game, caster: Seat): Promise<void> {
  await game.seat(caster).cast("pf");
  const other = caster === P1 ? P2 : P1;
  const want = (s: Seat) => (s === P1 ? "drake" : "vex");
  await until(game, isPickFor(caster, /banish/i));
  await game.seat(caster).pick(want(caster));
  await until(game, isPickFor(other, /banish/i));
  await game.seat(other).pick(want(other));
  expect(game.zoneOf("pf")).toBe("trash");
  expect(game.zoneOf("drake")).toBe("banishment");
  expect(game.zoneOf("vex")).toBe("banishment");
}

/** Drive both placements: Vex → `vexTo`, Drake → base, in whatever order the engine asks; end in open main. */
async function placeBoth(game: Game, vexTo: "base" | "battlefield-bf2"): Promise<Seat[]> {
  const askedOrder: Seat[] = [];
  for (let i = 0; i < 40; i++) {
    const d = game.decision();
    if (isOpenMain(d)) {
      break;
    }
    if (isDestinationPick(d)) {
      askedOrder.push(d!.seat);
      await game.seat(d!.seat).pick(d!.seat === P2 ? vexTo : "base");
      continue;
    }
    await game.settle({ maxSteps: 1 });
  }
  expect(isOpenMain(game.decision())).toBe(true);
  return askedOrder;
}

describe("Promising Future × Vex, Apathetic × Dune Drake — who cast PF decides whether the flipped Vex stuns the flipped Drake", () => {
  // ── Case A: P1's turn, P1 casts ──────────────────────────────────────────────────────────────
  test("A: plays are queued next-player-first — P2 is asked to place Vex BEFORE P1 is asked to place Drake; Drake is still banished while Vex lands (354.3, 303.2.a, 337.1.b)", async () => {
    const game = await board(P1).build();
    await castAndBanish(game, P1);
    const d = (await until(game, isDestinationPick)) as Pick;
    expect(d.seat).toBe(P2);
    expect(d.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf2"]);
    expect(game.zoneOf("drake")).toBe("banishment");
    await game.p2.pick("battlefield-bf2");
    expect(game.zoneOf("vex")).toBe("battlefield-bf2");
    expect(game.state("vex")).toMatchObject({ controller: P2, isExhausted: true, zone: "battlefield-bf2" }); // 143.4
    expect(game.zoneOf("drake")).toBe("banishment");
    const d2 = (await until(game, isDestinationPick)) as Pick;
    expect(d2.seat).toBe(P1);
    expect(d2.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1"]);
  });

  test("A: when Drake enters, Vex (live at bf2) triggers — a P2-controlled Vex item is appended with NO target prompt for P2 ('it' is determined, 355.10.d); Drake is not yet stunned", async () => {
    const game = await board(P1).build();
    await castAndBanish(game, P1);
    await until(game, isDestinationPick);
    await game.p2.pick("battlefield-bf2");
    await until(game, isDestinationPick);
    await game.p1.pick("base");
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.state("drake")).toMatchObject({ controller: P1, isExhausted: true });
    // Straight to a priority window over Vex's trigger — P2 was never asked to pick a unit.
    let p2PickedTarget = false;
    const d = await until(game, (x) => {
      p2PickedTarget ||= x?.kind === "pick" && x.seat === P2;
      return isChainPriority(x);
    });
    expect(p2PickedTarget).toBe(false);
    expect(d?.kind).toBe("action");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vex", controller: P2, triggered: true })]);
    expect(game.state("drake").isStunned).toBe(false); // only on resolution
  });

  // BUG — expected (337.1.a/337.3/337.4): PF's two queued plays are Pending items; they are finalized back to
  // back (each unit resolving immediately, 337.2) and Vex's trigger is appended and finalized, all before
  // anyone receives priority. Actual: the engine opens a pass-around priority window while both flipped cards
  // are still un-finalized in banishment (and again between the two placements).
  test("BUG: A: the FIRST priority window opens only after Vex is at bf2, Drake is in base and Vex's trigger is the lone chain item (337.4) — engine grants priority while the plays are still Pending", async () => {
    const game = await board(P1).build();
    await castAndBanish(game, P1);
    for (let i = 0; i < 20; i++) {
      const d = game.decision();
      if (isChainPriority(d) || isOpenMain(d)) {
        break;
      }
      if (isDestinationPick(d)) {
        await game.seat(d!.seat).pick(d!.seat === P2 ? "battlefield-bf2" : "base");
        continue;
      }
      await game.settle({ maxSteps: 1 });
    }
    expect(isChainPriority(game.decision())).toBe(true);
    expect(game.zoneOf("vex")).toBe("battlefield-bf2");
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vex", controller: P2, triggered: true })]);
  });

  test("A: after everyone passes, Vex's trigger resolves: Dune Drake is Stunned, exhausted in P1's base, and carries a this-turn 'can't move' restriction; Vex herself is untouched", async () => {
    const game = await board(P1).build();
    await castAndBanish(game, P1);
    const order = await placeBoth(game, "battlefield-bf2");
    expect(order).toEqual([P2, P1]);
    expect(game.chain()).toEqual([]);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("drake")).toMatchObject({ controller: P1, isExhausted: true, isStunned: true, might: 5, zone: "base" });
    expect(game.state("drake").grantedKeywords).toEqual([expect.objectContaining({ duration: "turn", keyword: "NoMove" })]);
    expect(game.state("vex")).toMatchObject({ controller: P2, isStunned: false, might: 4, zone: "battlefield-bf2" });
    expect(game.p1.can("move", "drake")).toBe(false);
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2, [P2]: 1 }); // PF + Drake / Vex
    expect(game.violations()).toEqual([]);
  });

  test("A: the movement lock is 'this turn' only — after the turn passes the granted restriction is gone", async () => {
    const game = await board(P1).build();
    await castAndBanish(game, P1);
    await placeBoth(game, "battlefield-bf2");
    await game.advanceTurn(); // → P2
    expect(game.state("drake").grantedKeywords).toEqual([]);
  });

  // ── Case B: P2's turn, P2 casts ──────────────────────────────────────────────────────────────
  test("B: with P2 casting, P1 is the next player — P1 is asked to place Drake FIRST while Vex is still a Pending item in banishment", async () => {
    const game = await board(P2).build();
    await castAndBanish(game, P2);
    const d = (await until(game, isDestinationPick)) as Pick;
    expect(d.seat).toBe(P1);
    expect(d.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1"]);
    expect(game.zoneOf("vex")).toBe("banishment");
    await game.p1.pick("base");
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.state("drake")).toMatchObject({ controller: P1, isExhausted: true, isStunned: false });
    expect(game.zoneOf("vex")).toBe("banishment"); // 384.2: not on the board when the play completed
    // The only Vex item around is her own still-pending play — Drake's entry created no trigger item.
    expect(game.chain().filter((c) => c.cardId === "vex")).toHaveLength(1);
    expect(game.chain().some((c) => c.cardId === "drake")).toBe(false);
    const d2 = (await until(game, isDestinationPick)) as Pick;
    expect(d2.seat).toBe(P2);
  });

  test("B: Vex then enters bf2 and nothing triggers (no look-back, 383.2.c / 384.2): chain empty, P2's open main phase, Drake NOT stunned and free of any move lock", async () => {
    const game = await board(P2).build();
    await castAndBanish(game, P2);
    const order = await placeBoth(game, "battlefield-bf2");
    expect(order).toEqual([P1, P2]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.state("vex")).toMatchObject({ controller: P2, isExhausted: true, zone: "battlefield-bf2" });
    expect(game.state("drake")).toMatchObject({ controller: P1, isExhausted: true, isStunned: false, zone: "base" });
    expect(game.state("drake").grantedKeywords).toEqual([]);
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 1, [P2]: 2 }); // Drake / PF + Vex
    expect(game.violations()).toEqual([]);
  });

  test("A vs B: identical flips, identical placements — only the caster (turn order) differs, and only Case A ends with a stunned Drake", async () => {
    const a = await board(P1).build();
    await castAndBanish(a, P1);
    await placeBoth(a, "battlefield-bf2");
    const b = await board(P2).build();
    await castAndBanish(b, P2);
    await placeBoth(b, "battlefield-bf2");
    expect([a.state("drake").isStunned, b.state("drake").isStunned]).toEqual([true, false]);
  });

  // ── Case C: as A but Vex to base ─────────────────────────────────────────────────────────────
  test("C: as A but P2 puts Vex in her BASE — 'while I'm at a battlefield' is false when Drake enters (383.2.a.1): no trigger, chain empty, Drake not stunned", async () => {
    const game = await board(P1).build();
    await castAndBanish(game, P1);
    const order = await placeBoth(game, "base");
    expect(order).toEqual([P2, P1]);
    expect(game.state("vex")).toMatchObject({ controller: P2, zone: "base" });
    expect(game.p2.base()).toContain("vex");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("drake")).toMatchObject({ isStunned: false, zone: "base" });
    expect(game.state("drake").grantedKeywords).toEqual([]);
  });
});
