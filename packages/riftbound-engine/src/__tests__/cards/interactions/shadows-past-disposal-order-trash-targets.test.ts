/**
 * Interaction: Shadows of the Past (ven-103-166) · Spell · Chaos · 3 + [chaos]
 *     "Return up to 2 units from trashes to their owners' hands."
 *   × Disposal Order (unl-103-219) · Spell · Body · 2 · [Reaction]
 *     "Choose one — • Choose up to 3 cards from opponents' trashes. Their owners recycle them. • Draw 1."
 *
 * Question: P1's trash holds unit cards A and B (and a non-unit); P2's trash holds unit card C; P2 holds
 * Disposal Order. P1 plays Shadows of the Past.
 *   (a) When are the cards picked and what is offered — may P1 pick C from P2's trash, may P1 pick zero?
 *   (b) P1 picks A and C; P2 responds with Disposal Order (mode 1) choosing A — what is P2 offered? What
 *       does Shadows do on resolution?
 *   (c) With zero picks, does Shadows still go on the chain, cost, give P2 priority, and go to trash?
 *
 * Rules: 355.10.a / 355.10.a.1 (trashes are PUBLIC zones) + 355.9.a (zone named explicitly) → the cards
 * are TARGETS chosen at finalization (355.5, 355.7); 355.13 ("up to" allows zero); 355.15 (choices are
 * locked); 359.3.e.2 / 359.3.e.4 (a target that changed zones to/from a non-board zone is illegal — a
 * recycled card is a new object); 359.3.e.5 (illegal targets are unaffected); 359.3.e.8 (the rest of a
 * multi-target instruction still executes).
 *
 * Expected: (a) offered = every UNIT card in every trash {A, B, C} (not the non-unit), 0–2 picks, chosen
 * as the spell is played. (b) Disposal Order offers P2 only cards in P1's trash {A, B, junk} (never its own
 * C); LIFO: A is recycled to the bottom of P1's deck, P2 draws nothing (mode 1); Shadows then returns C
 * to P2's hand and does NOTHING to A (now in the deck) — B, never targeted, stays put. (c) yes: paid,
 * on the chain with no targets, P2 gets priority, resolves doing nothing, goes to P1's trash.
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHADOWS_OF_THE_PAST = "ven-103-166";
const DISPOSAL_ORDER = "unl-103-219";
const SHIPYARD_SKULKER = "ogn-175-298";

/**
 * P1's turn, exactly 3 + [chaos] for Shadows. P1's trash: A (Shipyard Skulker), B (vanilla unit) and a
 * junk spell (non-unit). P2's trash: C (vanilla unit). P2: Disposal Order + exactly 2 energy.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .resources(P2, { energy: 2 })
    .trash(P1, SHIPYARD_SKULKER, "A")
    .trash(P1, { might: 2, name: "Unit B" }, "B")
    .trash(P1, { cardType: "spell", domain: "chaos", energyCost: 1, name: "Junk Spell" }, "junk")
    .trash(P2, { might: 4, name: "Unit C" }, "C")
    .hand(P1, SHADOWS_OF_THE_PAST, "shadows")
    .hand(P2, DISPOSAL_ORDER, "disposal");
}

function targetField(game: Game, seat: Seat, alias: string) {
  return game.seat(seat).option("cast", alias)?.fields.find((f) => f.name === "targets");
}

function targetsOffered(game: Game, seat: Seat, alias: string): string[] {
  return [...new Set((targetField(game, seat, alias)?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : v == null ? [] : [v]) as string[]))];
}

/** P1 casts Shadows on A + C and passes; P2 answers with Disposal Order mode 1 (index 0) on A. Chain: [shadows, disposal]. */
async function shadowsThenDisposal(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("shadows", { targets: ["A", "C"] });
  await game.p1.passPriority();
  await game.p2.cast("disposal", { mode: 0, targets: ["A"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["shadows", "disposal"]);
  return game;
}

describe("(a) Shadows of the Past — targets are picked at finalization from ALL trashes", () => {
  test("the pick is part of PLAYING the spell: the cast option carries a `targets` field (min 0, max 2) — nothing is deferred to resolution (355.5, 355.7, 355.10.a)", async () => {
    const game = await board().build();
    const field = targetField(game, P1, "shadows");
    expect(field).toMatchObject({ max: 2, min: 0, name: "targets" });
    // A bare cast is refused as ambiguous precisely because the choice must be named now.
    const r = await game.p1.try((p) => p.cast("shadows"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("shadows")).toBe("hand");
  });

  test("offered = every UNIT card in EVERY player's trash: A and B (P1's) and C (P2's) — the non-unit card in P1's trash is not offered", async () => {
    const game = await board().build();
    const offered = targetsOffered(game, P1, "shadows");
    expect(offered.sort()).toEqual(["A", "B", "C"]);
    expect(offered).not.toContain("junk");
  });

  test("legal pick sets are all subsets of size 0..2 — including the empty set and the cross-trash pair {A, C} (355.13)", async () => {
    const game = await board().build();
    const sets = ((targetField(game, P1, "shadows")?.options ?? []) as string[][]).map((s) => [...s].sort().join("+")).sort();
    expect(sets).toEqual(["", "A", "A+B", "A+C", "B", "B+C", "C"]);
    await expect(game.p1.cast("shadows", { targets: ["A", "B", "C"] })).rejects.toThrow();
  });

  test("P1 picks A (own trash) and C (P2's trash): 3 energy + 1 chaos paid, Shadows on the chain showing targets [A, C], P1 holds priority", async () => {
    const game = await board().build();
    await game.p1.cast("shadows", { targets: ["A", "C"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shadows", controller: P1, targets: ["A", "C"], triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.zoneOf("A")).toBe("trash"); // nothing moves until resolution
    expect(game.zoneOf("C")).toBe("trash");
  });

  test("no response: both return to their OWNERS' hands — A to P1, C to P2; B stays in P1's trash; Shadows to P1's trash", async () => {
    const game = await board().build();
    await game.p1.cast("shadows", { targets: ["A", "C"] });
    await game.settle();
    expect(game.p1.hand()).toEqual(["A"]);
    expect(game.p2.hand().sort()).toEqual(["C", "disposal"]);
    expect(game.zoneOf("B")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["B", "junk", "shadows"]);
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) P2 responds with Disposal Order (mode 1) on A", () => {
  test("after P1 passes, Disposal Order is legal for P2 (Reaction, exactly 2 energy) and its mode-1 targets are only cards in OPPONENTS' trashes: A, B and the junk spell — never P2's own C", async () => {
    const game = await board().build();
    await game.p1.cast("shadows", { targets: ["A", "C"] });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "disposal")).toBe(true);
    const modeField = game.p2.option("cast", "disposal")?.fields.find((f) => f.name === "mode");
    expect(modeField?.labels).toEqual(["Recycle up to 3 from opponents' trashes", "Draw 1"]);
    const offered = targetsOffered(game, P2, "disposal");
    expect(offered.sort()).toEqual(["A", "B", "junk"]);
    expect(offered).not.toContain("C");
    expect(targetField(game, P2, "disposal")).toMatchObject({ max: 3, min: 0 });
  });

  test("P2 casts it choosing A: 2 energy paid; chain = [Shadows (P1, A+C), Disposal Order (P2, mode 1, A)]; P2 holds priority", async () => {
    const game = await shadowsThenDisposal();
    expect(game.p2.energy()).toBe(0);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "shadows", controller: P1, targets: ["A", "C"] }),
      expect.objectContaining({ cardId: "disposal", controller: P2, mode: 0, targets: ["A"] }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("LIFO — Disposal Order resolves first: A is recycled to the BOTTOM of P1's main deck (its owner's), P2 draws nothing (mode 1, not mode 2); Shadows still pending with its locked targets", async () => {
    const game = await shadowsThenDisposal();
    const p1Deck = game.p1.deck().length;
    const p2Hand = game.p2.hand().length; // Disposal already left the hand
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("disposal")).toBe("trash");
    expect(game.zoneOf("A")).toBe("mainDeck");
    expect(game.p1.deck()).toHaveLength(p1Deck + 1);
    expect(game.p1.deck().at(-1)).toBe("A");
    expect(game.p2.deck()).not.toContain("A");
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shadows", targets: ["A", "C"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("Shadows then resolves: C (still a legal target) returns to P2's hand — partial execution (359.3.e.8); B, never targeted, is NOT swapped in (355.15); Shadows to P1's trash", async () => {
    const game = await shadowsThenDisposal();
    await game.settle();
    expect(game.zoneOf("C")).toBe("hand");
    expect(game.p2.hand()).toContain("C");
    expect(game.zoneOf("B")).toBe("trash");
    expect(game.p1.hand()).not.toContain("B");
    expect(game.zoneOf("shadows")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // Expected (359.3.e.2 / 359.3.e.4 / 359.3.e.5): A moved trash → main deck (a non-board zone change)
  // before Shadows resolved, so A is an ILLEGAL target and is unaffected — it stays at the bottom of P1's
  // deck and P1's hand stays empty. Actual: the engine follows A into the main deck and puts it into
  // P1's hand anyway (Shadows "returns" a card that is no longer in any trash).
  test("the recycled A is an illegal target — Shadows must leave it at the bottom of P1's deck, P1 gets NO card (359.3.e.2, 359.3.e.5)", async () => {
    const game = await shadowsThenDisposal();
    const p1Deck = game.p1.deck().length;
    await game.settle();
    expect(game.zoneOf("C")).toBe("hand"); // the legal half still happened
    expect(game.zoneOf("A")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("A");
    expect(game.p1.deck()).toHaveLength(p1Deck + 1);
    expect(game.p1.hand()).toEqual([]);
  });

  test("net ledger: P2 spent Disposal Order + 2 energy and got C back; P1 spent Shadows + 3+[chaos]; B and the junk spell untouched in P1's trash (A is nowhere in a trash)", async () => {
    const game = await shadowsThenDisposal();
    await game.settle();
    expect(game.p2.trash()).toEqual(["disposal"]);
    expect(game.p2.hand()).toEqual(["C"]);
    expect(game.p1.trash().sort()).toEqual(["B", "junk", "shadows"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.p2.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) zero targets — still a played spell", () => {
  test("P1 may cast Shadows naming NO targets (355.13): full cost paid, it sits on the chain with an empty target list, and P2 receives priority (could still react)", async () => {
    const game = await board().build();
    await game.p1.cast("shadows", { targets: [] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("shadows")).toBe("chain");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shadows", controller: P1, targets: [] })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disposal")).toBe(true);
  });

  test("it resolves doing nothing — every trash card stays put, no prompt appears at resolution — and goes to P1's trash", async () => {
    const game = await board().build();
    await game.p1.cast("shadows", { targets: [] });
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.zoneOf("B")).toBe("trash");
    expect(game.zoneOf("C")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
    expect(game.p2.hand()).toEqual(["disposal"]);
    expect(game.zoneOf("shadows")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["A", "B", "junk", "shadows"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
