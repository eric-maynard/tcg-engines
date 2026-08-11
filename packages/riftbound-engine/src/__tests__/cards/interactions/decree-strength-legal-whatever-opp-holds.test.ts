/**
 * Interaction: Decree of Strength (ven-085-166) × Ravenbloom Student (ogn-103-298)
 *
 *   Decree of Strength — Body spell, 1: "Choose an opponent. They reveal their hand and you choose a Mind card
 *     from it. They recycle that card."
 *   Ravenbloom Student — Mind unit, 2 Might: "When you play a spell, give me +1 [Might] this turn."
 *
 * Question: P1's turn, Open state, P1 controls Student and holds Decree. Three boards differing ONLY in P2's
 * private hand: (a) {Mind card M, Fury card F}; (b) {F1, F2}; (c) empty. Is Decree legal in all three with an
 * identical menu / identical redacted view (the engine must not peek at P2's hand)? What is targeted at
 * finalization and what does P2 see of the chain item? On resolution: is there a pick, can P1 decline it in
 * (a), what is recycled, does Student get +1, and what does P1 see of P2's hand afterwards?
 *
 * Rules: 355.9.a (the opponent is the only play-time target), 355.10.a / 108.7.c (a card in a Private zone is
 * chosen on resolution, not targeted), 108.7.e (hand COUNT is public), 358.1 / 358.5, 424.1 / 424.1.a.3 /
 * 424.3.a (reveal = public while the spell resolves, then private again), 359.3.e.6 / 359.3.e.10 / 359.3.e.11
 * (impossible instructions are skipped; the spell still counts as played), 416.1.c (recycle → bottom of the
 * owner's deck), 419.4.a (Student triggers on the completed play).
 */
import { describe, expect, test } from "bun:test";
import type { CardView, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DECREE = "ven-085-166";
const STUDENT = "ogn-103-298";
const MIND_SPELL = "ogn-095-298"; // Stupefy · Mind
const FURY_SPELL = "ogn-004-298"; // Cleave · Fury

type HandCase = "a" | "b" | "c";

/** P1: 1 energy, Ravenbloom Student in base, Decree in hand. P2's hand per case. */
function board(kind: HandCase) {
  const s = scenario().resources(P1, { energy: 1 }).unit(P1, "base", STUDENT, "student").hand(P1, DECREE, "decree");
  if (kind === "a") {
    s.hand(P2, MIND_SPELL, "M").hand(P2, FURY_SPELL, "F");
  } else if (kind === "b") {
    s.hand(P2, FURY_SPELL, "F1").hand(P2, FURY_SPELL, "F2");
  }
  return s;
}

/** What P1 sees of P2's hand: card ids for revealed entries, "hidden" for redacted ones. */
function p1SeesP2Hand(game: Game): string[] {
  const hand = (game.p1.view().zones.hand ?? []) as readonly CardView[];
  return hand.filter((c) => c.owner === P2).map((c) => ("hidden" in c && c.hidden ? "hidden" : (c as { id: string }).id));
}

/** P1's full legal menu, serialised (keys, fields, flat variants). */
function menuJson(game: Game): string {
  return JSON.stringify(game.p1.legal().map((o) => ({ fields: o.fields, key: o.key, variants: o.variants })));
}

/** Cast Decree and pass priority around until it has left the chain (WITHOUT auto-answering any prompt). */
async function castAndResolve(game: Game): Promise<void> {
  await game.p1.cast("decree");
  for (let i = 0; i < 6 && game.chain().length > 0 && game.decision()?.kind === "action"; i++) {
    await game.acting().pass();
  }
}

describe("Decree of Strength is legal whatever the opponent holds; the Mind pick happens on resolution", () => {
  test("legality: castable in (a), (b) AND (c) — P1's whole menu is byte-identical across the three boards; only P2's public hand COUNT differs in P1's view (2 / 2 / 0, all redacted)", async () => {
    const ga = await board("a").build();
    const gb = await board("b").build();
    const gc = await board("c").build();
    for (const g of [ga, gb, gc]) {
      expect(g.p1.can("cast", "decree")).toBe(true);
    }
    expect(menuJson(gb)).toBe(menuJson(ga));
    expect(menuJson(gc)).toBe(menuJson(ga));
    // No play-time card choice at all: the opponent (forced in a duel) is the only target; the Mind card is not.
    expect(ga.p1.option("cast", "decree")?.fields ?? []).toEqual([]);
    expect(p1SeesP2Hand(ga)).toEqual(["hidden", "hidden"]);
    expect(p1SeesP2Hand(gb)).toEqual(["hidden", "hidden"]);
    expect(p1SeesP2Hand(gc)).toEqual([]);
  });

  test("finalization: one non-triggered item controlled by P1; P2's view names Decree (→ player P2 at most) and never a card in P2's hand; 1 energy paid", async () => {
    const game = await board("a").build();
    await game.p1.cast("decree");
    expect(game.p1.energy()).toBe(0);
    const seen = game.p2.view().chain;
    expect(seen).toEqual([expect.objectContaining({ cardId: "decree", controller: P1, triggered: false })]);
    const targets = seen[0]?.targets ?? [];
    expect(targets).not.toContain("M");
    expect(targets).not.toContain("F");
    expect(targets.every((t) => t === P2)).toBe(true);
    // Still private while the item merely sits on the chain (reveal happens on resolution, 424.3.a).
    expect(p1SeesP2Hand(game)).toEqual(["hidden", "hidden"]);
  });

  test("(a) resolution: P2's hand {M, F} is revealed to P1; P1 gets a MANDATORY pick whose only option is the Mind card M — no decline, F not pickable", async () => {
    const game = await board("a").build();
    await castAndResolve(game);
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1, source: { cardId: "decree" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["M"]);
    expect(p1SeesP2Hand(game).sort()).toEqual(["F", "M"]); // public reveal in progress (424.1)
    // P2 only sees THAT P1 is picking, not a private menu of its own.
    expect(game.p2.view().decision).toMatchObject({ kind: "pick", seat: P1 });
    expect((await game.p1.try((p) => p.decline())).ok).toBe(false);
    expect((await game.p1.try((p) => p.pick("F"))).ok).toBe(false);
    expect(game.zoneOf("M")).toBe("hand"); // nothing moved by the failed attempts
  });

  test("(a) P1 picks M → P2 recycles it to the BOTTOM of P2's deck (416.1.c); P2's hand count drops to 1; Student +1 (3 Might); Decree in P1's trash; P2's hand is private again for P1", async () => {
    const game = await board("a").build();
    const deckBefore = game.p2.deck().length;
    await castAndResolve(game);
    await game.p1.pick("M");
    await game.settle();
    expect(game.zoneOf("M")).toBe("mainDeck");
    expect(game.p2.deck().at(-1)).toBe("M");
    expect(game.p2.deck()).toHaveLength(deckBefore + 1);
    expect(game.p1.deck()).not.toContain("M");
    expect(game.p2.hand()).toEqual(["F"]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.state("student").might).toBe(3);
    expect(game.zoneOf("decree")).toBe("trash");
    expect(game.p1.trash()).toEqual(["decree"]);
    expect(p1SeesP2Hand(game)).toEqual(["hidden"]); // 424.1.a.3 — reveal ended with the spell
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(b) P2 holds {F1, F2} — no Mind card: the hand is revealed but NO pick Decision is generated (not an empty pick, not a forced OK), nothing is recycled, Student still +1, Decree to trash", async () => {
    const game = await board("b").build();
    const bottomBefore = game.p2.deck().at(-1);
    await castAndResolve(game);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // straight back to P1's open main phase
    expect([...game.p2.hand()].sort()).toEqual(["F1", "F2"]);
    expect(game.p2.deck().at(-1)).toBe(bottomBefore);
    expect(game.p2.trash()).toEqual([]);
    expect(game.state("student").might).toBe(3);
    expect(game.zoneOf("decree")).toBe("trash");
    expect(p1SeesP2Hand(game)).toEqual(["hidden", "hidden"]);
  });

  test("(c) P2's hand is EMPTY: still castable, resolves doing nothing (359.3.e.10/11), no Decision, Student still +1, Decree to trash", async () => {
    const game = await board("c").build();
    expect(game.p1.can("cast", "decree")).toBe(true);
    await castAndResolve(game);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.hand()).toEqual([]);
    expect(game.state("student").might).toBe(3);
    expect(game.zoneOf("decree")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
  });

  test("Student's +1 is 'this turn' in every case and the revealed identities are history only: a card P2 draws next turn is never exposed to P1 (424.1.a.3)", async () => {
    const game = await board("a").build();
    await castAndResolve(game);
    await game.p1.pick("M");
    await game.settle();
    expect(game.state("student").might).toBe(3);
    await game.advanceTurn(); // → P2's turn: P2 draws 1
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("student").might).toBe(2);
    expect(game.p2.hand()).toHaveLength(2);
    expect(p1SeesP2Hand(game)).toEqual(["hidden", "hidden"]);
    expect(game.violations()).toEqual([]);
  });
});
