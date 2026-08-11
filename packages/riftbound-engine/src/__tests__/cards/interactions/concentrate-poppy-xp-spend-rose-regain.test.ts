/**
 * Interaction: a Level-conditional discount flipping off and back on between cost determinations.
 *   Concentrate (unl-091-219) · Spell · Body · 5
 *     "Draw 2. [Level 6][>] This costs [2] less. [Level 11][>] This costs [4] less instead."
 *   × Poppy, Defender of the Meek (unl-178-219) · Champion Unit · Order · 6 + [order] · 5 Might
 *     "You may spend 3 XP as an additional cost to play me. If you do, I cost [3] less. [Ambush] [Tank]"
 *   × Blood Rose (unl-109-219) · Gear · Body · 1
 *     "When you play a unit, you may pay [1] to gain 1 XP.  Spend 3 XP, [Exhaust]: Ready a unit."
 *
 * Rules: 824.1.c / 824.1.d (a Level ability is active exactly while its controller has ≥ N XP), 356.1 /
 * 356.4 (a card's cost — including its own conditional discount — is determined when THAT card is played),
 * 356.2.b.1 (an optional additional cost elected in step 2 with a linked discount; paid in 357.2), 357.2,
 * 419.2, 729–733 (XP is gained/spent only by effects and costs that say so).
 *
 * Question: P1's turn, 8 XP, Blood Rose in base, a unit holding bf1; hand: Concentrate + Poppy.
 *   (a) Concentrate now → 3.  (b) Poppy first spending 3 XP (→5), Rose declined, then Concentrate → 5 (Level 6
 *   is re-read at Concentrate's own cost step).  (c) as (b) but pay Rose's [1] (→6 XP) first → Concentrate 3;
 *   energy across the line 3+1+3 = 7 vs (a)-then-Poppy 3+3 = 6.  (d) 11 XP: Concentrate alone = 1 ("instead",
 *   not 0); Poppy-with-XP first (→8) → 3; plus Rose (→9) → still 3.  (e) 6 XP: Concentrate (3) resolves, then
 *   Poppy spending XP (→3) and Blood Rose's activated ability (→0) never re-price the resolved spell.
 *   Parity: 5 XP & {3} → Concentrate not offered; a unit play + Rose bump to 6 XP with {3} left → offered,
 *   drains to 0. Poppy lists both cost lines only while P1 has ≥ 3 XP.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const CONCENTRATE = "unl-091-219";
const POPPY = "unl-178-219";
const BLOOD_ROSE = "unl-109-219";
/** A vanilla 3-cost unit for the parity line. */
const CHEAP_UNIT = { energyCost: 3, might: 1, name: "Cheap Recruit" } as const;

/** P1's turn: `xp` XP, `energy` + 1 [order] pooled, Blood Rose in base, a Holder at bf1, Concentrate + Poppy in hand. */
function board(xp = 8, energy = 20) {
  return scenario()
    .resources(P1, { energy, power: { order: 1 } })
    .xp(P1, xp)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .gear(P1, BLOOD_ROSE, "rose")
    .hand(P1, CONCENTRATE, "conc")
    .hand(P1, POPPY, "poppy");
}

/** Energy / order / XP P1 spends performing `fn`. */
async function paid(game: Game, fn: () => Promise<unknown>): Promise<{ energy: number; order: number; xp: number }> {
  const e = game.p1.energy();
  const o = game.p1.power("order");
  const x = game.p1.xp();
  await fn();
  return { energy: e - game.p1.energy(), order: o - game.p1.power("order"), xp: x - game.p1.xp() };
}

/** Poppy's offered play lines as (energy, xp) quotes, de-duplicated across destinations. */
function poppyLines(game: Game): { energy: number; xp: number }[] {
  const seen = new Map<string, { energy: number; xp: number }>();
  for (const v of game.p1.option("play", "poppy")?.variants ?? []) {
    const q = (v.params as { quote?: { energy: number; xp: number } }).quote;
    if (q) {
      seen.set(`${q.energy}/${q.xp}`, { energy: q.energy, xp: q.xp });
    }
  }
  return [...seen.values()].sort((a, b) => a.energy - b.energy);
}

/** Play Poppy to base spending 3 XP; answer Blood Rose's finalization opt-in; let everything resolve. */
async function poppyWithXp(game: Game, rose: "pay" | "decline"): Promise<void> {
  await game.p1.play("poppy", { payOptional: true, to: "base" });
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "rose", pendingChoiceType: "opt-in" }, timing: "FIN" });
  await (rose === "pay" ? game.p1.yes() : game.p1.no());
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("poppy")).toBe("base");
}

describe("(a) 8 XP: Concentrate cast first", () => {
  test("Level 6 is active at 8 XP (824.1.c): Concentrate costs 5 − 2 = 3, spends no XP, draws 2", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    const cost = await paid(game, () => game.p1.cast("conc"));
    expect(cost).toEqual({ energy: 3, order: 0, xp: 0 });
    await game.settle();
    expect(game.zoneOf("conc")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 2);
    expect(game.p1.xp()).toBe(8);
  });

  test("enumerated ≡ accepted: exactly one cast line for Concentrate (no targets, no options)", async () => {
    const game = await board().build();
    expect(game.p1.option("cast", "conc")?.variants).toHaveLength(1);
  });
});

describe("(b) Poppy FIRST spending 3 XP, Blood Rose declined, then Concentrate", () => {
  test("Poppy's XP line: 3 energy + [order] + 3 XP (356.2.b.1 — elected in step 2, discount in 356.4, XP paid in 357) → XP 8 → 5", async () => {
    const game = await board().build();
    const cost = await paid(game, () => game.p1.play("poppy", { payOptional: true, to: "base" }));
    expect(cost).toEqual({ energy: 3, order: 1, xp: 3 });
    expect(game.p1.xp()).toBe(5);
  });

  test("Blood Rose's 'you may pay [1]' is asked at FINALIZATION of its play-a-unit trigger; declining removes it with nothing paid and no XP gained", async () => {
    const game = await board().build();
    await game.p1.play("poppy", { payOptional: true, to: "base" });
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "rose" }, timing: "FIN" });
    const e = game.p1.energy();
    await game.p1.no();
    await game.settle();
    expect(game.p1.energy()).toBe(e);
    expect(game.p1.xp()).toBe(5);
    expect(game.chain()).toEqual([]);
  });

  test("Concentrate afterwards re-reads Level 6 at ITS OWN cost step (356.1, 824.1.d): 5 XP < 6 → full 5 energy", async () => {
    const game = await board().build();
    await poppyWithXp(game, "decline");
    expect(game.p1.xp()).toBe(5);
    const cost = await paid(game, () => game.p1.cast("conc"));
    expect(cost).toEqual({ energy: 5, order: 0, xp: 0 });
  });
});

describe("(c) as (b) but Blood Rose's [1] is paid before Concentrate", () => {
  test("YES pays the [1] at finalization; the trigger resolves → XP 5 → 6", async () => {
    const game = await board().build();
    await game.p1.play("poppy", { payOptional: true, to: "base" });
    const cost = await paid(game, () => game.p1.yes());
    expect(cost).toEqual({ energy: 1, order: 0, xp: 0 });
    expect(game.p1.xp()).toBe(5); // gained on resolution, not on payment
    await game.settle();
    expect(game.p1.xp()).toBe(6);
  });

  test("Level 6 is active again → Concentrate costs 3", async () => {
    const game = await board().build();
    await poppyWithXp(game, "pay");
    expect(game.p1.xp()).toBe(6);
    const cost = await paid(game, () => game.p1.cast("conc"));
    expect(cost).toEqual({ energy: 3, order: 0, xp: 0 });
  });

  test("ordering changes real totals: line (c) spends 3 + 1 + 3 = 7 energy (+[order]); line (a)-then-Poppy-with-XP spends 3 + 3 = 6 (+[order]) and ends at 5 XP", async () => {
    const lineC = await board().build();
    const c0 = lineC.p1.energy();
    await poppyWithXp(lineC, "pay");
    await lineC.p1.cast("conc");
    await lineC.settle();
    expect(c0 - lineC.p1.energy()).toBe(7);
    expect(lineC.p1.power("order")).toBe(0);
    expect(lineC.p1.xp()).toBe(6);

    const lineA = await board().build();
    const a0 = lineA.p1.energy();
    await lineA.p1.cast("conc");
    await lineA.settle();
    await poppyWithXp(lineA, "decline");
    expect(a0 - lineA.p1.energy()).toBe(6);
    expect(lineA.p1.power("order")).toBe(0);
    expect(lineA.p1.xp()).toBe(5);
  });
});

describe("(d) starting at 11 XP", () => {
  test("Concentrate alone: 'costs [4] less INSTEAD' — only the highest active tier applies: 5 − 4 = 1 (not 5 − 6 → 0)", async () => {
    const game = await board(11).build();
    const cost = await paid(game, () => game.p1.cast("conc"));
    expect(cost).toEqual({ energy: 1, order: 0, xp: 0 });
  });

  test("with exactly 1 energy pooled it is offered and drains the pool; with 0 it is not", async () => {
    const one = await board(11, 1).build();
    expect(one.p1.can("cast", "conc")).toBe(true);
    await one.p1.cast("conc");
    expect(one.p1.energy()).toBe(0);
    const zero = await board(11, 0).build();
    expect(zero.p1.can("cast", "conc")).toBe(false);
  });

  test("Poppy-with-XP first (11 → 8): the Level 11 tier switches off, Level 6 stays → Concentrate 3", async () => {
    const game = await board(11).build();
    await poppyWithXp(game, "decline");
    expect(game.p1.xp()).toBe(8);
    expect((await paid(game, () => game.p1.cast("conc"))).energy).toBe(3);
  });

  test("…plus Blood Rose (8 → 9): still 3 — the −4 tier needs 11", async () => {
    const game = await board(11).build();
    await poppyWithXp(game, "pay");
    expect(game.p1.xp()).toBe(9);
    expect((await paid(game, () => game.p1.cast("conc"))).energy).toBe(3);
  });
});

describe("(e) starting at exactly 6 XP: Concentrate first, then XP is spent twice", () => {
  /** 6 XP board plus an exhausted friendly unit for Blood Rose's activated ability to ready. */
  const boardE = () => board(6).unit(P1, "base", { might: 2, name: "Sleepy" }, "sleepy", { exhausted: true });

  test("Concentrate at 6 XP costs 3 and resolves (draw 2); Poppy afterwards still lists the XP line and costs 3 + [order] + 3 XP → XP 3", async () => {
    const game = await boardE().build();
    expect((await paid(game, () => game.p1.cast("conc"))).energy).toBe(3);
    await game.settle();
    expect(game.zoneOf("conc")).toBe("trash");
    expect(poppyLines(game)).toEqual([
      { energy: 3, xp: 3 },
      { energy: 6, xp: 0 },
    ]);
    const cost = await paid(game, () => game.p1.play("poppy", { payOptional: true, to: "base" }));
    expect(cost).toEqual({ energy: 3, order: 1, xp: 3 });
    await game.p1.no();
    await game.settle();
    expect(game.p1.xp()).toBe(3);
  });

  test("the already-paid Concentrate is never re-priced: total energy after Concentrate (3) + Poppy (3) is exactly 6 even though XP is now 3 (< Level 6)", async () => {
    const game = await boardE().build();
    const e0 = game.p1.energy();
    await game.p1.cast("conc");
    await game.settle();
    await poppyWithXp(game, "decline");
    expect(game.p1.xp()).toBe(3);
    expect(e0 - game.p1.energy()).toBe(6);
    expect(game.zoneOf("conc")).toBe("trash");
  });

  test("Blood Rose's OTHER ability (Spend 3 XP, [Exhaust]: Ready a unit) then takes XP 3 → 0 up front, exhausts the Rose, readies the chosen unit — and nothing retroactive happens to the pool or the resolved spell", async () => {
    const game = await boardE().build();
    const e0 = game.p1.energy();
    await game.p1.cast("conc");
    await game.settle();
    await poppyWithXp(game, "decline");
    expect(game.p1.can("activate", "rose")).toBe(true);
    const before = game.p1.energy();
    await game.p1.activate("rose", undefined, { targets: "sleepy" });
    expect(game.p1.xp()).toBe(0);
    expect(game.state("rose").isExhausted).toBe(true);
    await game.settle();
    expect(game.state("sleepy").isReady).toBe(true);
    expect(game.p1.energy()).toBe(before);
    expect(e0 - game.p1.energy()).toBe(6);
    expect(game.zoneOf("conc")).toBe("trash");
  });

  test("with XP now 0 the Rose's activated ability and Poppy's XP line are both gone from the menu (a second Poppy would list only 6 + [order])", async () => {
    const game = await boardE().hand(P1, POPPY, "poppy2").resources(P1, { energy: 20, power: { order: 2 } }).build();
    await game.p1.cast("conc");
    await game.settle();
    await poppyWithXp(game, "decline");
    await game.p1.activate("rose", undefined, { targets: "sleepy" });
    await game.settle();
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.can("activate", "rose")).toBe(false);
    const lines = new Set((game.p1.option("play", "poppy2")?.variants ?? []).map((v) => JSON.stringify((v.params as { quote?: { energy: number; xp: number } }).quote)));
    expect([...lines].map((s) => JSON.parse(s))).toEqual([expect.objectContaining({ energy: 6, xp: 0 })]);
  });
});

describe("parity — Concentrate's offer tracks the live XP threshold against the pool", () => {
  test("5 XP with {3} pooled: Concentrate costs 5 → NOT offered; cast attempt refused, card stays in hand", async () => {
    const game = await board(5, 3).build();
    expect(game.p1.can("cast", "conc")).toBe(false);
    expect((await game.p1.try((p) => p.cast("conc"))).ok).toBe(false);
    expect(game.zoneOf("conc")).toBe("hand");
  });

  test("5 XP, {7}: play a 3-cost unit ({4} left), pay Blood Rose's [1] ({3} left) → XP 6 → Concentrate is now offered at 3 and drains the pool to 0", async () => {
    const game = await board(5, 7).hand(P1, CHEAP_UNIT, "cheap").build();
    await game.p1.play("cheap");
    expect(game.p1.energy()).toBe(4);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "rose" }, timing: "FIN" });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.xp()).toBe(6);
    expect(game.p1.energy()).toBe(3);
    expect(game.p1.can("cast", "conc")).toBe(true);
    await game.p1.cast("conc");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("conc")).toBe("trash");
  });

  test("Poppy lists BOTH lines (6+[order] / 3+[order]+3 XP) at ≥ 3 XP and only the full line at 2 XP", async () => {
    const three = await board(3).build();
    expect(poppyLines(three)).toEqual([
      { energy: 3, xp: 3 },
      { energy: 6, xp: 0 },
    ]);
    const two = await board(2).build();
    expect(poppyLines(two)).toEqual([{ energy: 6, xp: 0 }]);
    expect((await two.p1.try((p) => p.play("poppy", { payOptional: true, to: "base" }))).ok).toBe(false);
    expect(two.zoneOf("poppy")).toBe("hand");
  });
});
