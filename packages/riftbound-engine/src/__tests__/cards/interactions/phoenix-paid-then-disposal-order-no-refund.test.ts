/**
 * Interaction: a trash-zone trigger whose cost is paid at finalization, then its object is recycled away.
 *   Immortal Phoenix (ogn-037-298) · Unit · Fury · 3 + [fury] · 3 Might
 *     "[Assault 2] When you kill a unit with a spell, you may pay [1][fury] to play me from your trash."
 *   × Disposal Order (unl-103-219) · Spell (Reaction) · Body · 2
 *     "Choose one — Choose up to 3 cards from opponents' trashes. Their owners recycle them. / Draw 1."
 *   × Vengeance (ogn-229-298) · Spell · Order · 4 + [order][order] — "Kill a unit."
 *
 * Rules: 383.3.a / 383.3.b.1 + 204.3.a / 740.4.a.2 (a leading "you may pay [C] to …" is decided AND paid as
 * the trigger is finalized), 337.1.a (finalizing passes no priority), 355.9.a (trash cards are public-zone
 * targets), 416.5 (2+ cards recycled together → bottom in random order), 359.3.e.2 / .e.4 / .e.6 / .e.7 (an
 * instruction whose object left its zone for a non-board zone cannot be followed and is ignored), 419.3 +
 * 355.2.a (an effect play chooses base or a controlled battlefield), 143.4 (enters exhausted).
 *
 * Question: P1's turn. Immortal Phoenix + T1 + T2 in P1's trash; P1 has exactly Vengeance's cost plus [1][fury].
 * P1 Vengeances P2's unit; it resolves → Phoenix triggers.
 *   (a) When does P1 opt in and pay — and does P2 get a window BEFORE the payment?
 *   (b) P1 pays; P2 responds with Disposal Order (mode 1) on Phoenix, T1, T2. It resolves first. Then the
 *       Phoenix trigger: is Phoenix played from the deck? refund? any location prompt?
 *   (c) P2 recycles only T1, T2: Phoenix is played — where may it go, how does it enter?
 *   (d) Could P2 have Disposal-Ordered Phoenix while Vengeance was still on the chain to pre-empt everything?
 *
 * Expected: (a) opt-in + [1][fury] at FINALIZATION (timing FIN), before P2's first window. (b) Disposal is
 * legal in that window, resolves first (Phoenix/T1/T2 → bottom of P1's deck); the trigger then finds no
 * Phoenix in the trash → nothing played, NO destination prompt, no error, no refund (P1 at 0/0). (c) Phoenix
 * still there → P1 picks base or bf1 (which it controls), pays nothing more, Phoenix enters exhausted.
 * (d) Yes — and then the ability never triggers at all: no prompt, P1 keeps its [1][fury].
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMMORTAL_PHOENIX = "ogn-037-298";
const DISPOSAL_ORDER = "unl-103-219";
const VENGEANCE = "ogn-229-298";
const T1 = { energyCost: 1, might: 1, name: "Trash One" } as const;
const T2 = { energyCost: 1, might: 1, name: "Trash Two" } as const;

/**
 * P1's turn. P1: 5 energy + [order][order] + [fury] (Vengeance 4+[o][o] leaves exactly [1][fury]); a Holder
 * at bf1 (a battlefield P1 controls); trash = Phoenix, T1, T2; Vengeance in hand. P2: Victim (3) in base,
 * Disposal Order in hand with its 2 energy.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 1, order: 2 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 3, name: "Victim" }, "victim")
    .trash(P1, IMMORTAL_PHOENIX, "phoenix")
    .trash(P1, T1, "t1")
    .trash(P1, T2, "t2")
    .hand(P1, VENGEANCE, "vengeance")
    .hand(P2, DISPOSAL_ORDER, "disposal");
}

/** Vengeance on the Victim; both pass; it resolves and kills → the Phoenix opt-in is open for P1. */
async function vengeanceResolved(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("vengeance", { targets: "victim" });
  expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("victim")).toBe("trash");
  return game;
}

/** P1 opts in and pays; P1 passes; P2 answers with Disposal Order mode 1 on `targets`. */
async function paidThenDisposal(targets: string[]): Promise<Game> {
  const game = await vengeanceResolved();
  await game.p1.yes();
  await game.p1.passPriority();
  await game.p2.cast("disposal", { mode: 0, targets });
  return game;
}

/** Trash-card sets Disposal Order (mode 1) offers P2 right now. */
const disposalSets = (game: Game): string[][] =>
  (game.p2.option("cast", "disposal")?.fields.find((f) => f.name === "targets")?.options ?? [])
    .filter((o): o is string[] => Array.isArray(o))
    .map((o) => [...o].sort());

describe("(a) opt-in and payment happen at FINALIZATION, before P2's first window", () => {
  test("the moment Vengeance resolves, the Phoenix trigger is on the chain and P1 is asked 'Pay [1][fury] …?' with timing FIN — P2 has had no decision in between and cannot act now (383.3.a, 337.1.a)", async () => {
    const game = await vengeanceResolved();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "phoenix", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({
      canAccept: true,
      kind: "yes-no",
      seat: P1,
      source: { cardId: "phoenix", pendingChoiceType: "opt-in" },
      timing: "FIN",
    });
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.legal()).toEqual([]);
    expect(game.p2.can("cast", "disposal")).toBe(false);
  });

  test("YES pays the [1][fury] immediately (P1 → 0/0) while the item stays on the chain unresolved; only THEN does priority open — P1 first, P2 after P1 passes (383.3.b.1, 204.3.a)", async () => {
    const game = await vengeanceResolved();
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
    expect(game.zoneOf("phoenix")).toBe("trash"); // nothing played yet
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "phoenix", triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disposal")).toBe(true);
  });

  test("declining instead removes the item with nothing paid: P1 keeps [1][fury], Phoenix stays in the trash", async () => {
    const game = await vengeanceResolved();
    await game.p1.no();
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } });
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });
});

describe("(b) paid, then Disposal Order recycles Phoenix + T1 + T2 in response", () => {
  test("Disposal Order (Reaction) is legal in P2's window and offers P1's trash cards as public targets — Phoenix, T1, T2 (and the spent Vengeance) in sets of up to 3 (355.9.a)", async () => {
    const game = await vengeanceResolved();
    await game.p1.yes();
    await game.p1.passPriority();
    const sets = disposalSets(game);
    expect(sets).toContainEqual(["phoenix", "t1", "t2"]);
    expect(sets).toContainEqual(["phoenix"]);
    expect(sets.flat()).toContain("vengeance");
    expect(sets.every((s) => s.length <= 3)).toBe(true);
  });

  test("it goes on top of the Phoenix item and resolves FIRST: Phoenix, T1, T2 leave the trash for the bottom of P1's main deck (416.5)", async () => {
    const game = await paidThenDisposal(["phoenix", "t1", "t2"]);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "phoenix", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "disposal", controller: P2, mode: 0, targets: ["phoenix", "t1", "t2"], triggered: false }),
    ]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "phoenix", triggered: true })]);
    expect(game.zoneOf("phoenix")).toBe("mainDeck");
    expect(game.zoneOf("t1")).toBe("mainDeck");
    expect(game.zoneOf("t2")).toBe("mainDeck");
    expect(game.p1.deck().slice(-3).sort()).toEqual(["phoenix", "t1", "t2"]);
    expect(game.p1.trash()).toEqual(["vengeance"]);
  });

  test("when the Phoenix item then resolves, 'play me from your trash' has no referent (359.3.e.2/.e.6/.e.7): nothing is played, NO destination prompt is shown, no error — straight back to P1's open main phase", async () => {
    const game = await paidThenDisposal(["phoenix", "t1", "t2"]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("phoenix")).toBe("mainDeck");
    expect(game.p1.units().sort()).toEqual(["holder"]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the [1][fury] paid at finalization is NOT refunded: P1 ends at 0 energy / 0 fury with Phoenix in the deck; Disposal Order → P2's trash", async () => {
    const game = await paidThenDisposal(["phoenix", "t1", "t2"]);
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
    expect(game.p2.energy()).toBe(0);
    expect(game.zoneOf("disposal")).toBe("trash");
  });
});

describe("(c) contrast — P2 recycles only T1 + T2 (or does nothing): Phoenix is played", () => {
  test("Phoenix stays a legal referent → on resolution P1 is asked WHERE (base or bf1, which P1 controls — 355.2.a, 419.3); choosing bf1 puts it there exhausted (143.4) for no further payment", async () => {
    const game = await paidThenDisposal(["t1", "t2"]);
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: "phoenix" } });
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.zone ?? o.key).sort() : []).toEqual(["base", "battlefield-bf1"]);
    await game.p1.pick("bf1");
    await game.settle();
    expect(game.state("phoenix")).toMatchObject({ controller: P1, isExhausted: true, location: "bf1", might: 3 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } }); // the [1][fury] was the whole price
    expect([game.zoneOf("t1"), game.zoneOf("t2")]).toEqual(["mainDeck", "mainDeck"]); // recycled, irrelevant to Phoenix
  });

  test("…or to base; and with P2 simply passing (no Disposal Order) the same prompt and entry happen", async () => {
    const toBase = await paidThenDisposal(["t1", "t2"]);
    await toBase.settle();
    await toBase.p1.pick("base");
    await toBase.settle();
    expect(toBase.state("phoenix")).toMatchObject({ isExhausted: true, location: "base", zone: "base" });

    const quiet = await vengeanceResolved();
    await quiet.p1.yes();
    const r = await quiet.settle();
    expect(r.reason).toBe("unanswered");
    expect(quiet.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    await quiet.p1.pick("base");
    await quiet.settle();
    expect(quiet.zoneOf("phoenix")).toBe("base");
    expect(quiet.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
    expect(quiet.zoneOf("disposal")).toBe("hand");
  });
});

describe("(d) contrast — pre-emptive Disposal Order while Vengeance is still on the chain", () => {
  test("legal: Vengeance opened a chain, Disposal Order is a Reaction, and Phoenix in P1's trash is already a target", async () => {
    const game = await board().build();
    await game.p1.cast("vengeance", { targets: "victim" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "disposal")).toBe(true);
    expect(disposalSets(game)).toContainEqual(["phoenix"]);
  });

  test("Disposal resolves first (Phoenix → deck), then Vengeance kills the Victim — with Phoenix out of the trash its ability NEVER triggers: no yes/no for P1 at all, P1 keeps the [1][fury], chain ends empty", async () => {
    const game = await board().build();
    await game.p1.cast("vengeance", { targets: "victim" });
    await game.p1.passPriority();
    await game.p2.cast("disposal", { mode: 0, targets: ["phoenix"] });
    const r = await game.settle();
    expect(r.reason).toBe("open"); // never stopped on a Phoenix prompt
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("phoenix")).toBe("mainDeck");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("side by side: pre-emptive Disposal → no prompt & resources kept; post-payment Disposal → prompt WAS shown, payment kept by the game, play skipped silently", async () => {
    const pre = await board().build();
    await pre.p1.cast("vengeance", { targets: "victim" });
    await pre.p1.passPriority();
    await pre.p2.cast("disposal", { mode: 0, targets: ["phoenix"] });
    await pre.settle();

    const post = await paidThenDisposal(["phoenix", "t1", "t2"]);
    await post.settle();

    expect([pre.zoneOf("phoenix"), post.zoneOf("phoenix")]).toEqual(["mainDeck", "mainDeck"]);
    expect([pre.p1.energy(), pre.p1.power("fury")]).toEqual([1, 1]);
    expect([post.p1.energy(), post.p1.power("fury")]).toEqual([0, 0]);
    expect(pre.p1.units()).toEqual(["holder"]);
    expect(post.p1.units()).toEqual(["holder"]);
  });
});
