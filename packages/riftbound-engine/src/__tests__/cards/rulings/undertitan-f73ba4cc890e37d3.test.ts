/**
 * Ruling f73ba4cc890e37d3 — Undertitan (SFD-175 → sfd-175-221) · Unit · Order · [6][order] · 5 Might
 *     "When you play me, give your other units +2 [Might] this turn. As I'm revealed from your deck, [Add] [2]."
 *   × Rift Herald (UNL-179 → unl-179-219) · 7 Might "When I move to a battlefield, look at the top 3 cards of your Main
 *     Deck. You may REVEAL a unit from among them and draw it. Recycle the rest."
 *   (× Baited Hook OGN-242 → ogn-242-298 — the contrast: it only LOOKS, so no energy; covered by ruling 4088642056a6cedb.)
 *
 * Q: If I reveal an Undertitan with Rift Herald's move trigger, do I get the 2 Energy?
 * A: Yes. Rift Herald's text says "reveal": choosing Undertitan as the revealed unit fires "As I'm revealed from your
 *    deck, [Add] [2]" — 2 Energy is added, then Undertitan is drawn and the rest are recycled. Merely being among the
 *    looked-at cards (not chosen) is a look, not a reveal — no energy.
 * Rules: 409 (Look) vs 410 / 424.2.a (Reveal — only when an effect instructs a reveal), Undertitan's reveal effect.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, scenario } from "../../../harness";

const UNDERTITAN = "sfd-175-221";
const RIFT_HERALD = "unl-179-219";
const SKULKER = "ogn-175-298";

/** P1's turn, empty pool. Rift Herald ready in base; bf1 open. Deck top: Undertitan, Skulker A, Skulker B, then Below. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", RIFT_HERALD, "herald")
    .deck(P1, [UNDERTITAN, SKULKER, SKULKER, SKULKER], ["titan", "sa", "sb", "below"]);
}

/** Herald moves to bf1; its look trigger resolves into the "reveal a unit from among them" pick. */
async function heraldMoves(): Promise<{ game: Game; d: PickDecision }> {
  const game = await board().build();
  expect(game.p1.energy()).toBe(0);
  await game.p1.move("herald", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "herald", controller: P1, triggered: true })]);
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return { d: d as PickDecision, game };
}

describe("Ruling f73ba4cc890e37d3 — revealing Undertitan with Rift Herald's move trigger adds [2]", () => {
  test("the look itself adds nothing: P1 sees the top 3 (Undertitan among the choices) with 0 energy in the pool", async () => {
    const { game, d } = await heraldMoves();
    expect(d.semantics).toBe("from-revealed");
    expect(d.options.map((o) => o.card ?? o.key)).toEqual(expect.arrayContaining(["titan", "sa", "sb"]));
    expect(d.options.map((o) => o.card ?? o.key)).not.toContain("below"); // only 3 looked at
    expect(game.p1.energy()).toBe(0); // looking ≠ revealing
  });

  test("choosing Undertitan: it is drawn, the two Skulkers are recycled under 'below', the Herald takes bf1", async () => {
    const { game } = await heraldMoves();
    const deckSize = game.p1.deck().length;
    await game.p1.pick("titan");
    await game.settle(); // hands back the showdown at open bf1 once
    await game.settle();
    expect(game.p1.hand()).toEqual(["titan"]);
    const deck = game.p1.deck();
    expect(deck).toHaveLength(deckSize - 1);
    expect(deck[0]).toBe("below");
    expect([...deck.slice(-2)].sort()).toEqual(["sa", "sb"]);
    expect(game.locationOf("herald")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  // Expected: picking Undertitan for "you may REVEAL a unit from among them and draw it" is a reveal from the deck, so
  // "As I'm revealed from your deck, [Add] [2]" fires and P1's energy goes 0 → 2 before/as it is drawn. Actual: the
  // Herald's look → reveal-and-pick draws the picked card without treating the pick as a reveal (no `reveal` event, no
  // mandatory on-reveal effect), so the pool stays at 0.
  test("ruling f73ba4cc890e37d3 — the unit picked ('revealed') off Rift Herald's look does not fire Undertitan's 'As I'm revealed, [Add] [2]'; energy stays 0", async () => {
    const { game } = await heraldMoves();
    await game.p1.pick("titan");
    expect(game.p1.hand()).toEqual(["titan"]);
    expect(game.p1.energy()).toBe(2);
    await game.settle();
    await game.settle();
    expect(game.p1.energy()).toBe(2);
  });

  test("contrast: choosing a Skulker instead — Undertitan was only looked at and is recycled unrevealed: NO energy", async () => {
    const { game } = await heraldMoves();
    await game.p1.pick("sa");
    await game.settle();
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.hand()).toEqual(["sa"]);
    expect(game.zoneOf("titan")).toBe("mainDeck");
    expect(game.p1.deck().slice(-2)).toContain("titan"); // recycled to the bottom
  });

  test("contrast: declining the reveal ('you may') — all 3 recycled, no energy", async () => {
    const { game, d } = await heraldMoves();
    expect(d.allowDecline).toBe(true);
    await game.p1.decline();
    await game.settle();
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("below");
  });
});
