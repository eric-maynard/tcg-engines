/**
 * Interaction: Insightful Investigator (unl-135-219) · Unit · Chaos · 3 · 3 Might
 *     "When you play me, choose an opponent. They reveal their hand. You may pay 2 XP to choose a card
 *      from their hand. If you do, they discard that card and draw 1."
 *   × Scrapheap (ogn-182-298) · Gear · Chaos · 2 — "When this is played, discarded, or killed, draw 1."
 *
 * Rules: 108.7.c (a hand is Private Information), 424.1 (Reveal = present to ALL players), 424.1.a.3 (the
 * Revealed state lasts until the revealing spell/ability finishes resolving), 424.3.a (reveal a zone = all
 * cards CURRENTLY in it), 424.3.a.1 (cards added to that zone afterwards do NOT become Revealed), 422.1 /
 * 422.1.b (discard = hand → trash; "when discarded" triggers execute after the discard), 108.2.d (trash is
 * public), 383.3.b (Investigator's "pay 2 XP" is paid on RESOLUTION, its own example).
 *
 * Question: P1 (2 XP) plays Investigator choosing P2. P2's hand = {Scrapheap, X}; P2's deck top = D1, D2.
 *   (a) while the trigger waits on the chain (P2 holding priority), does P1 already see Scrapheap/X?
 *   (b) on resolution: are Scrapheap and X named to P1, and is the reveal on the public record?
 *   (c) P1 pays 2 XP, picks Scrapheap: P2 discards it and draws D1; Scrapheap's trigger draws D2. Are D1/D2
 *       ever exposed to P1? After the ability has fully resolved, is X still exposed in P1's live view?
 *   (d) contrast: 1 XP (or P1 declines): hand still revealed? any pick? when does the exposure end?
 *
 * Expected: (a) No — the reveal is an effect executed on resolution; before that P1 sees two anonymous cards.
 * (b) Yes — both named in P1's pick options and P1's view; the reveal is public (424.1) so it lands on the
 * shared reveal record. (c) XP 2 → 0; Scrapheap → P2's trash (public), P2 draws D1 inside the same
 * instruction, then Scrapheap's discard trigger resolves and P2 draws D2. Neither D1 nor D2 is ever exposed
 * (424.3.a.1), and X's Revealed state ended with the ability (424.1.a.3) → P1's live view of P2's hand is 3
 * anonymous cards. (d) The reveal is unconditional; with 1 XP nothing is pickable (or P1 declines); nothing
 * is discarded or drawn; exposure ends when the ability finishes resolving.
 */
import { describe, expect, test } from "bun:test";
import type { CardView, Game } from "../../../harness";
import { isHiddenView, P1, P2, scenario } from "../../../harness";

const INVESTIGATOR = "unl-135-219";
const SCRAPHEAP = "ogn-182-298";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit — "X", the other card in P2's hand
const D1 = { abilities: [], cardType: "spell", domain: "chaos", energyCost: 9, name: "Deck Card One" } as const;
const D2 = { abilities: [], cardType: "spell", domain: "chaos", energyCost: 9, name: "Deck Card Two" } as const;

/** P1 (`xp`, exactly Investigator's 3 energy) vs P2 holding {Scrapheap, X} with D1, D2 on top of the deck. */
function board(xp: number) {
  return scenario()
    .xp(P1, xp)
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: null })
    .hand(P1, INVESTIGATOR, "inv")
    .hand(P2, SCRAPHEAP, "scrap")
    .hand(P2, SKULKER, "x")
    .deck(P2, [D1, D2], ["d1", "d2"]);
}

/** P2's hand exactly as P1's live view shows it: "hidden" or the card id. */
function p2HandSeenByP1(game: Game): string[] {
  const cards: CardView[] = (game.p1.view().zones.hand ?? []).filter((c) => c.owner === P2);
  return cards.map((c) => (isHiddenView(c) ? "hidden" : c.id));
}

/** The shared public-reveal record (rule 424.1), flattened to card ids. */
function publiclyRevealed(game: Game): string[] {
  const rec = (game.gameState as { publicReveals?: { cardIds: readonly string[] }[] }).publicReveals ?? [];
  return rec.flatMap((r) => [...r.cardIds]);
}

/** Both players pass once → the newest chain item resolves. */
async function resolveTop(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

/** Play Investigator and let its trigger resolve up to P1's reveal-and-pick prompt. */
async function toThePick(xp: number): Promise<Game> {
  const game = await board(xp).build();
  await game.p1.play("inv");
  await resolveTop(game);
  return game;
}

describe("Insightful Investigator × Scrapheap — a revealed hand's NEW cards stay private; the reveal ends with the ability", () => {
  // ── (a) before resolution: nothing exposed ──────────────────────────────────────────────

  test("(a) playing Investigator finalizes her trigger onto the chain; while P1 and then P2 hold priority, P2's hand is two ANONYMOUS cards in P1's view (108.7.c) and nothing is on the reveal record", async () => {
    const game = await board(2).build();
    await game.p1.play("inv");
    expect(game.zoneOf("inv")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "inv", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(p2HandSeenByP1(game)).toEqual(["hidden", "hidden"]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // P2's reaction window — still before the reveal
    expect(p2HandSeenByP1(game)).toEqual(["hidden", "hidden"]);
    expect(publiclyRevealed(game)).toEqual([]);
    expect(game.p1.xp()).toBe(2); // nothing paid at finalization (383.3.b)
  });

  // ── (b) on resolution: a PUBLIC reveal of exactly the current hand ──────────────────────

  test("(b) on resolution P1 is asked to pick FROM THE REVEALED hand: the options name Scrapheap and X by id, and P1's live view of P2's hand now shows both identities (424.3.a)", async () => {
    const game = await toThePick(2);
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "from-revealed", source: { cardId: "inv" }, timing: "RES" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["scrap", "x"]);
    expect(p2HandSeenByP1(game).sort()).toEqual(["scrap", "x"]);
    expect(game.p1.xp()).toBe(2); // still unpaid until P1 actually picks
  });

  test("(b) it is a reveal, not a private look: P2's view shows P1's pending decision sourced from the reveal (P2 knows its hand is on the table), and the revealer recorded on the prompt is P2", async () => {
    const game = await toThePick(2);
    const asP2 = game.view(P2).decision;
    expect(asP2).toMatchObject({ kind: "pick", seat: P1 });
    const d = game.decision();
    expect(d?.kind === "pick" ? d.meta?.revealer : undefined).toBe(P2);
  });

  // Expected (424.1): revealing presents the cards to ALL players, so — like every other reveal path (Void
  // Rush, Diana, facedown zone changes) — Scrapheap and X land on the shared `publicReveals` record, which is
  // the only place a log/UI/spectator can later name them from. Actual: the `reveal-hand` handler opens the
  // pick prompt but never writes the public-reveal record, so the history is empty.
  test("(b) the hand reveal is written to the shared public-reveal record naming exactly Scrapheap and X (424.1)", async () => {
    const game = await toThePick(2);
    expect(publiclyRevealed(game).sort()).toEqual(["scrap", "x"]);
  });

  // ── (c) pay 2 XP, pick Scrapheap ────────────────────────────────────────────────────────

  test("(c) P1 picks Scrapheap: 2 XP paid (→ 0), Scrapheap goes hand → P2's trash (422.1) and P2 draws D1 within the same instruction; Scrapheap's 'discarded' trigger is now a P2 chain item (422.1.b)", async () => {
    const game = await toThePick(2);
    const p2Deck = game.p2.deck().length;
    await game.p1.pick("scrap");
    expect(game.p1.xp()).toBe(0);
    expect(game.zoneOf("scrap")).toBe("trash");
    expect(game.p2.trash()).toEqual(["scrap"]);
    expect(game.p2.hand()).toEqual(["x", "d1"]);
    expect(game.p2.deck()).toHaveLength(p2Deck - 1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "scrap", controller: P2, triggered: true })]);
  });

  test("(c) D1 entered the hand after the reveal instruction executed → it is NOT revealed; and Investigator's ability has finished resolving → X's Revealed state has ended too: with Scrapheap's trigger still pending P1 sees two anonymous cards (424.3.a.1, 424.1.a.3)", async () => {
    const game = await toThePick(2);
    await game.p1.pick("scrap");
    expect(game.chain().map((c) => c.cardId)).toEqual(["scrap"]); // Investigator's item is gone — fully resolved
    expect(game.p2.hand()).toEqual(["x", "d1"]);
    expect(p2HandSeenByP1(game)).toEqual(["hidden", "hidden"]);
  });

  test("(c) the discarded Scrapheap itself stays known — the trash is public (108.2.d): P1's view names it in P2's trash", async () => {
    const game = await toThePick(2);
    await game.p1.pick("scrap");
    const p2Trash = (game.p1.view().zones.trash ?? []).filter((c) => c.owner === P2);
    expect(p2Trash.map((c) => (isHiddenView(c) ? "hidden" : c.id))).toEqual(["scrap"]);
  });

  test("(c) Scrapheap's discard trigger resolves → P2 draws D2; final: P2's hand = {X, D1, D2}, ALL three anonymous in P1's live view, P2's deck down 2, chain empty, XP 0", async () => {
    const game = await toThePick(2);
    const p2Deck = game.p2.deck().length;
    await game.p1.pick("scrap");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand()).toEqual(["x", "d1", "d2"]);
    expect(game.p2.deck()).toHaveLength(p2Deck - 2);
    expect(p2HandSeenByP1(game)).toEqual(["hidden", "hidden", "hidden"]);
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.hand()).toEqual([]); // P1 drew nothing — "THEY … draw 1"
    expect(game.violations()).toEqual([]);
  });

  test("(c) contrast — picking X instead: X is discarded (no trigger of its own), P2 draws only D1; Scrapheap stays in hand and is anonymous again once the ability has resolved; D2 still on top of the deck", async () => {
    const game = await toThePick(2);
    await game.p1.pick("x");
    await game.settle();
    expect(game.p1.xp()).toBe(0);
    expect(game.p2.trash()).toEqual(["x"]);
    expect(game.p2.hand()).toEqual(["scrap", "d1"]);
    expect(game.p2.deck()[0]).toBe("d2");
    expect(game.chain()).toEqual([]);
    expect(p2HandSeenByP1(game)).toEqual(["hidden", "hidden"]);
  });

  // ── (d) contrast: cannot / will not pay ─────────────────────────────────────────────────

  test("(d) 2 XP but P1 DECLINES after seeing the hand: nothing paid, nothing discarded, nothing drawn — and the exposure ends with the ability: both cards anonymous again", async () => {
    const game = await toThePick(2);
    const p2Deck = game.p2.deck().length;
    expect(p2HandSeenByP1(game).sort()).toEqual(["scrap", "x"]); // revealed while the prompt is open
    await game.p1.decline();
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.hand().sort()).toEqual(["scrap", "x"]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.p2.deck()).toHaveLength(p2Deck);
    expect(game.chain()).toEqual([]);
    expect(p2HandSeenByP1(game)).toEqual(["hidden", "hidden"]);
  });

  test("(d) only 1 XP: the reveal is unconditional — on resolution P1's view names Scrapheap and X — but no card is pickable (a pick, if attempted, is rejected)", async () => {
    const game = await toThePick(1);
    expect(p2HandSeenByP1(game).sort()).toEqual(["scrap", "x"]);
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.source?.cardId).toBe("inv");
      expect(d.options).toEqual([]);
      expect(d.allowDecline).toBe(true);
      expect((await game.p1.try((p) => p.pick("scrap"))).ok).toBe(false);
    } else {
      // No prompt at all is equally acceptable — but then nothing may have been taken from P2.
      expect(game.p2.hand().sort()).toEqual(["scrap", "x"]);
    }
    expect(game.p1.xp()).toBe(1);
  });

  test("(d) only 1 XP: after the ability finishes — XP 1, P2 keeps {Scrapheap, X}, no draw, and P1's live view is back to two anonymous cards", async () => {
    const game = await board(1).build();
    const p2Deck = game.p2.deck().length;
    await game.p1.play("inv");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.hand().sort()).toEqual(["scrap", "x"]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.p2.deck()).toHaveLength(p2Deck);
    expect(game.chain()).toEqual([]);
    expect(p2HandSeenByP1(game)).toEqual(["hidden", "hidden"]);
    expect(game.violations()).toEqual([]);
  });
});
