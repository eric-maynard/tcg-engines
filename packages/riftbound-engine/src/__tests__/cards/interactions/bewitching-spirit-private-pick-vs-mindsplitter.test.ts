/**
 * Interaction (harness visibility of a choice made inside an opponent's PRIVATE zone):
 *   Bewitching Spirit (unl-121-219) · Unit · Chaos · 3 · 2 Might
 *     "When you play me, choose a player. They discard 1."
 *   × Mindsplitter (ogn-192-298) · Unit · Chaos · 7 + [chaos][chaos] · 7 Might
 *     "When you play me, choose an opponent. They reveal their hand. Choose a card from it, and they discard that card."
 *   × Divine Judgment (ogn-244-298) · Spell · Order · 7 + [order][order] · Action
 *     "Each player chooses 2 units, 2 gear, 2 runes, and 2 cards in their hands. Recycle the rest."
 *
 * Question: P2's hand = {A, B, C}.
 *   (a) Spirit choosing P2: which seat gets the discard Decision, what does P1's view of it contain, and when does P1
 *       first learn which card it was?
 *   (b) Mindsplitter: which seat picks, are A/B/C listed by face to P1, are the unchosen two still exposed afterwards?
 *   (c) Divine Judgment with both players holding 3+ cards: is each hand Decision surfaced only to its own seat with
 *       faces, does the other seat see a pending decision WITHOUT options, are the recycled hand cards ever revealed?
 *   (d) Spirit choosing P1 himself; Spirit choosing a P2 with an empty hand.
 *
 * Rules: 422.1 / 422.1.a (the discarding player chooses, using private information), 128.4 (private information),
 * 108.7.c / 108.7.e (hand is Private; its COUNT is public), 108.2.d (trash is Public), 108.4.d (deck is Secret),
 * 424.3.a / 424.1.a.3 (a revealed hand is public until the revealing effect finishes), 355.10.e (a set chosen in
 * part by other players is not targeted — chosen at resolution), 416.1 (recycle → bottom of owner's deck).
 *
 * Expected: (a) Decision.seat = P2 listing A/B/C; P1.decision() null; P1's view carries only {seat, kind, prompt} and
 * no ids/labels of P2's hand anywhere; P1 learns the card when it hits P2's trash. (b) P1 picks from A/B/C listed by
 * face; P1's live view of P2's hand shows all three during the prompt; afterwards the chosen one is in P2's trash and
 * the other two are redacted again. (c) P1's Decision lists only P1's hand, P2's only P2's; each seat's view of the
 * other's pending pick has no options; unchosen hand cards go to the bottom of their owner's deck unrevealed — P1 sees
 * only P2's hand/deck COUNTS change, and deck entries carry no ids for either seat. (d) self → a P1-only Decision over
 * P1's hand; empty hand → nothing to discard, no Decision, resolution continues.
 *
 * Engine note: Divine Judgment's hand step is asked as "pick the hand-size − 2 cards to recycle" (the complement of
 * "choose 2 to keep") — same outcome, so the tests name the recycled cards.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPIRIT = "unl-121-219";
const MINDSPLITTER = "ogn-192-298";
const DIVINE_JUDGMENT = "ogn-244-298";

// Distinctive names/aliases so a substring search over a whole serialized view is a reliable leak detector.
const CARD_A = { abilities: [], cardType: "spell", domain: "fury", energyCost: 9, name: "Zeta Alpha" } as const;
const CARD_B = { abilities: [], cardType: "spell", domain: "fury", energyCost: 9, name: "Zeta Bravo" } as const;
const CARD_C = { abilities: [], cardType: "spell", domain: "fury", energyCost: 9, name: "Zeta Charlie" } as const;
const P2_HAND = ["qxA", "qxB", "qxC"];
const P2_FACES = [...P2_HAND, "Zeta Alpha", "Zeta Bravo", "Zeta Charlie"];

// P1's own filler hand cards (for the self-discard and Divine Judgment cases).
const MINE_1 = { abilities: [], cardType: "spell", domain: "calm", energyCost: 9, name: "Omega One" } as const;
const MINE_2 = { abilities: [], cardType: "spell", domain: "calm", energyCost: 9, name: "Omega Two" } as const;

/** P1's turn 2 with plenty of resources; P2's hand = {A, B, C}; P1 holds Spirit, Mindsplitter, Divine Judgment + 2 fillers. */
function board() {
  return scenario()
    .resources(P1, { energy: 20, power: { chaos: 2, order: 2 } })
    .hand(P2, CARD_A, "qxA")
    .hand(P2, CARD_B, "qxB")
    .hand(P2, CARD_C, "qxC")
    .hand(P1, SPIRIT, "spirit")
    .hand(P1, MINDSPLITTER, "ms")
    .hand(P1, DIVINE_JUDGMENT, "dj")
    .hand(P1, MINE_1, "mine1")
    .hand(P1, MINE_2, "mine2");
}

/** Cards of `owner`'s hand as `viewer` sees them: id, or "hidden" for a redacted entry. */
function handAsSeenBy(game: Game, viewer: typeof P1, owner: typeof P1): string[] {
  return (game.view(viewer).zones.hand ?? []).filter((c) => c.owner === owner).map((c) => ("id" in c ? c.id : "hidden"));
}

function deckAsSeenBy(game: Game, viewer: typeof P1, owner: typeof P1): string[] {
  return (game.view(viewer).zones.mainDeck ?? []).filter((c) => c.owner === owner).map((c) => ("id" in c ? c.id : "hidden"));
}

function publicReveals(game: Game): string[] {
  const rec = (game.gameState as { publicReveals?: { cardIds: readonly string[] }[] }).publicReveals ?? [];
  return rec.flatMap((r) => [...r.cardIds]);
}

/** Play Spirit, choose "Opponent discards 1" (mode 0) / "You discard 1" (mode 1), and let the trigger resolve up to the discard prompt. */
async function spirit(game: Game, mode: 0 | 1): Promise<void> {
  await game.p1.play("spirit");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "mode" }); // "choose a player"
  await game.p1.chooseMode(mode);
  await game.settle();
}

describe("Bewitching Spirit vs Mindsplitter vs Divine Judgment — who sees a pick made inside a private hand", () => {
  // ---- (a) Spirit choosing P2: the VICTIM chooses, privately -----------------------------------------------

  test("(a) 'choose a player' is P1's play-time choice (self / opponent modes); choosing P2 hands the DISCARD decision to seat P2 with A/B/C listed by face (422.1.a)", async () => {
    const game = await board().build();
    await spirit(game, 0);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P2 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(P2_HAND);
    expect(d?.kind === "pick" ? d.options.map((o) => o.label).join("|") : "").toContain("Zeta");
    expect(game.actingSeat()).toBe(P2);
  });

  test("(a) P1 has NO decision and no legal actions meanwhile; P1's view of the pending decision is a bare summary {id, seat: P2, kind, prompt} — no options, labels or card ids", async () => {
    const game = await board().build();
    await spirit(game, 0);
    expect(game.p1.decision()).toBeNull();
    expect(game.p1.legal()).toEqual([]);
    const seen = game.view(P1).decision;
    expect(seen).toMatchObject({ kind: "pick", seat: P2 });
    expect(Object.keys(seen ?? {}).sort()).toEqual(["context", "id", "kind", "prompt", "seat"].filter((k) => k in (seen ?? {})).sort());
    expect(seen && "options" in seen).toBe(false);
    const s = JSON.stringify(seen);
    for (const face of P2_FACES) {
      expect(s).not.toContain(face);
    }
  });

  test("(a) P1's live view of P2's hand stays fully redacted during the prompt (this is a discard, not a reveal) and nothing goes on the public-reveal record", async () => {
    const game = await board().build();
    await spirit(game, 0);
    expect(handAsSeenBy(game, P1, P2)).toEqual(["hidden", "hidden", "hidden"]);
    expect(publicReveals(game)).toEqual([]);
  });

  // BUG: the "public" game state carried in every seat's Observation still embeds the raw pendingChoice, whose
  // `revealed` array lists P2's hand card ids — so P1's serialized view names qxA/qxB/qxC while P2 is choosing.
  // Expected (128.4 / 108.7.c): no P1-visible payload contains any id or face from P2's hand before the discard lands.
  test("P1's whole Observation (state + zones + decision) must not contain ANY id or name from P2's hand while P2 picks (128.4, 108.7.c)", async () => {
    const game = await board().build();
    await spirit(game, 0);
    const everything = JSON.stringify(game.view(P1));
    for (const face of P2_FACES) {
      expect(everything).not.toContain(face);
    }
  });

  test("(a) P2 picks B → it lands in P2's trash, which is public: P1's view now names it (id + name); the other two stay hidden; P2's hand count reads 2 (108.2.d, 108.7.e)", async () => {
    const game = await board().build();
    await spirit(game, 0);
    await game.p2.pick("qxB");
    await game.settle();
    expect(game.zoneOf("qxB")).toBe("trash");
    const trashSeen = (game.view(P1).zones.trash ?? []).filter((c) => c.owner === P2);
    expect(trashSeen).toEqual([expect.objectContaining({ id: "qxB", name: "Zeta Bravo", zone: "trash" })]);
    expect(handAsSeenBy(game, P1, P2)).toEqual(["hidden", "hidden"]);
    expect(game.p2.hand().sort()).toEqual(["qxA", "qxC"]);
    expect(game.zoneOf("spirit")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(a) P1 cannot answer P2's discard for them", async () => {
    const game = await board().build();
    await spirit(game, 0);
    await expect(game.p1.pick("qxB")).rejects.toThrow();
    expect(game.zoneOf("qxB")).toBe("hand");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
  });

  // ---- (b) Mindsplitter: reveal first, then P1 chooses ------------------------------------------------------

  test("(b) Mindsplitter: the chooser is P1 — Decision.seat = P1 listing A/B/C by face; P2 sees only a summary of it", async () => {
    const game = await board().build();
    await game.p1.play("ms");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1, semantics: "from-revealed" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(P2_HAND);
    expect(d?.kind === "pick" ? d.options.map((o) => o.label) : []).toEqual(expect.arrayContaining([expect.stringContaining("Zeta Alpha")]));
    const p2Sees = game.view(P2).decision;
    expect(p2Sees).toMatchObject({ kind: "pick", seat: P1 });
    expect(p2Sees && "options" in p2Sees).toBe(false);
  });

  test("(b) while the pick is pending P2's whole hand is REVEALED to P1: P1's live view of P2's hand shows all three faces (424.3.a, 424.1.a.3)", async () => {
    const game = await board().build();
    await game.p1.play("ms");
    await game.settle();
    expect(handAsSeenBy(game, P1, P2).sort()).toEqual(P2_HAND);
    const faces = (game.view(P1).zones.hand ?? []).filter((c) => c.owner === P2).map((c) => ("name" in c ? c.name : "?"));
    expect(faces.sort()).toEqual(["Zeta Alpha", "Zeta Bravo", "Zeta Charlie"]);
  });

  // BUG: `reveal-hand` parks the reveal-and-pick prompt but never writes the shared public-reveal record, although
  // "They reveal their hand" presents A/B/C to ALL players (424.1) — every other reveal path records it.
  test("Mindsplitter's hand reveal should be recorded on the public-reveal record (A, B, C) (424.1)", async () => {
    const game = await board().build();
    await game.p1.play("ms");
    await game.settle();
    expect(publicReveals(game).sort()).toEqual(P2_HAND);
  });

  test("(b) P1 picks B → P2 discards it to P2's trash; the ability is finished so A and C are redacted again in P1's live view; Mindsplitter on the board", async () => {
    const game = await board().build();
    await game.p1.play("ms");
    await game.settle();
    await game.p1.pick("qxB");
    await game.settle();
    expect(game.zoneOf("qxB")).toBe("trash");
    expect(game.state("qxB").owner).toBe(P2);
    expect(game.p2.hand().sort()).toEqual(["qxA", "qxC"]);
    expect(handAsSeenBy(game, P1, P2)).toEqual(["hidden", "hidden"]);
    const everything = JSON.stringify(game.view(P1));
    expect(everything).not.toContain("Zeta Alpha");
    expect(everything).not.toContain("Zeta Charlie");
    expect(game.zoneOf("ms")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(b) P2 cannot make the Mindsplitter pick — it is P1's decision", async () => {
    const game = await board().build();
    await game.p1.play("ms");
    await game.settle();
    await expect(game.p2.pick("qxA")).rejects.toThrow();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  });

  // ---- (c) Divine Judgment: each player chooses from their own hand, privately -------------------------------

  test("(c) Divine Judgment resolves into P1's OWN hand pick first: seat P1, options = exactly P1's remaining hand (no P2 card), P2's view of it has no options (355.10.e)", async () => {
    const game = await board().build();
    await game.p1.cast("dj");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["mine1", "mine2", "ms", "spirit"]);
    const p2Sees = game.view(P2).decision;
    expect(p2Sees).toMatchObject({ kind: "pick", seat: P1 });
    expect(p2Sees && "options" in p2Sees).toBe(false);
    const s = JSON.stringify(p2Sees);
    expect(s).not.toContain("mine1");
    expect(s).not.toContain("Omega");
  });

  test("(c) after P1 names its two, the prompt passes to seat P2 listing ONLY P2's hand by face; P1.decision() is null and P1's view is a bare summary; P1's live view of P2's hand stays redacted (no reveal instruction)", async () => {
    const game = await board().build();
    await game.p1.cast("dj");
    await game.settle();
    await game.p1.pick("spirit", "ms"); // 4 in hand → name the 2 that go
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(P2_HAND);
    expect(game.p1.decision()).toBeNull();
    const p1Sees = game.view(P1).decision;
    expect(p1Sees).toMatchObject({ kind: "pick", seat: P2 });
    expect(p1Sees && "options" in p1Sees).toBe(false);
    for (const face of P2_FACES) {
      expect(JSON.stringify(p1Sees)).not.toContain(face);
    }
    expect(handAsSeenBy(game, P1, P2)).toEqual(["hidden", "hidden", "hidden"]);
  });

  // BUG: same root cause as (a) — Observation.state embeds pendingChoice.revealed = P2's hand ids while P2 chooses.
  test("during P2's Divine Judgment hand pick, P1's whole Observation must not name any P2 hand card (128.4, 108.7.c)", async () => {
    const game = await board().build();
    await game.p1.cast("dj");
    await game.settle();
    await game.p1.pick("spirit", "ms");
    await game.settle();
    const everything = JSON.stringify(game.view(P1));
    for (const face of P2_FACES) {
      expect(everything).not.toContain(face);
    }
  });

  test("(c) 'Recycle the rest': P2's unchosen card goes hand → bottom of P2's Main Deck, P1's to P1's; kept cards stay in hand; nothing is discarded (416.1)", async () => {
    const game = await board().build();
    const p2Deck = game.p2.deck().length;
    await game.p1.cast("dj");
    await game.settle();
    await game.p1.pick("spirit", "ms");
    await game.settle();
    await game.p2.pick("qxB"); // 3 in hand → name the 1 that goes; A and C are kept
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.hand().sort()).toEqual(["qxA", "qxC"]);
    expect(game.p1.hand().sort()).toEqual(["mine1", "mine2"]);
    expect(game.zoneOf("qxB")).toBe("mainDeck");
    expect(game.p2.deck().at(-1)).toBe("qxB");
    expect(game.p2.deck()).toHaveLength(p2Deck + 1);
    expect(game.p1.deck().slice(-2).sort()).toEqual(["ms", "spirit"]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.zoneOf("dj")).toBe("trash");
  });

  test("(c) Private → Secret with no reveal: P1 never learns which card P2 bottomed — P1's view of P2's deck is all-hidden, P2's OWN view of its deck is hidden too (108.4.d), only counts moved (108.7.e); no public-reveal entry for any hand card", async () => {
    const game = await board().build();
    const p2DeckCount = deckAsSeenBy(game, P1, P2).length;
    await game.p1.cast("dj");
    await game.settle();
    await game.p1.pick("spirit", "ms");
    await game.settle();
    await game.p2.pick("qxB");
    await game.settle();
    expect(new Set(deckAsSeenBy(game, P1, P2))).toEqual(new Set(["hidden"]));
    expect(new Set(deckAsSeenBy(game, P2, P2))).toEqual(new Set(["hidden"]));
    expect(deckAsSeenBy(game, P1, P2)).toHaveLength(p2DeckCount + 1);
    expect(handAsSeenBy(game, P1, P2)).toEqual(["hidden", "hidden"]);
    const everything = JSON.stringify(game.view(P1));
    for (const face of P2_FACES) {
      expect(everything).not.toContain(face);
    }
    expect(publicReveals(game).filter((id) => [...P2_HAND, "spirit", "ms", "mine1", "mine2"].includes(id))).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ---- (d) edges ------------------------------------------------------------------------------------------------

  test("(d) 'choose a player' includes yourself: mode 1 → a P1-ONLY discard Decision over P1's own hand; P2 sees a summary without options; P1 discards one of its own", async () => {
    const game = await board().build();
    await spirit(game, 1);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["dj", "mine1", "mine2", "ms"]);
    const p2Sees = game.view(P2).decision;
    expect(p2Sees).toMatchObject({ kind: "pick", seat: P1 });
    expect(p2Sees && "options" in p2Sees).toBe(false);
    await game.p1.pick("mine1");
    await game.settle();
    expect(game.zoneOf("mine1")).toBe("trash");
    expect(game.p2.hand().sort()).toEqual(P2_HAND); // P2 untouched
  });

  test("(d) Spirit choosing a P2 with an EMPTY hand: nothing to discard → no Decision is surfaced to anyone, the trigger finishes, Spirit is on the board and P1 is back in an open main phase", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, SPIRIT, "spirit").build();
    expect(game.p2.hand()).toEqual([]);
    await game.p1.play("spirit");
    await game.p1.chooseMode(0);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.decision()).toBeNull();
    expect(game.zoneOf("spirit")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.p2.trash()).toEqual([]);
  });
});
