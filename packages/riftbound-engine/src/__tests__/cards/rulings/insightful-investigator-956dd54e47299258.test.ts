/**
 * Ruling 956dd54e47299258 — Insightful Investigator (UNL-135 → unl-135-219) · Unit · Chaos · 3 · 3 Might
 *   "When you play me, choose an opponent. They reveal their hand. You may pay 2 XP to choose a card from their hand. If
 *    you do, they discard that card and draw 1."
 *
 * Q: After I pay and choose a card to discard, does my opponent have to reveal the NEW card they drew?
 * A: No. The reveal is a temporary modification of the specific set of cards in hand at that moment; the hand as a zone
 *    stays private, and cards entering it afterwards stay private unless something says otherwise.
 * Rules: 424.1 / 424.3.a (reveal a zone = the cards currently in it), 424.3.a.1 (later arrivals are not Revealed),
 *        424.1.a.3 (the Revealed state ends with the ability), 108.7.c (a hand is private).
 */
import { describe, expect, test } from "bun:test";
import type { CardView, Game } from "../../../harness";
import { isHiddenView, P1, P2, scenario } from "../../../harness";

const INVESTIGATOR = "unl-135-219";
const SKULKER = "ogn-175-298";
const NEW_CARD = { abilities: [], cardType: "spell", domain: "chaos", energyCost: 9, name: "Freshly Drawn" } as const;

/** P1 (2 XP, exactly 3 energy) plays Investigator; P2 holds {A, B}; P2's deck top is the card they'll draw ("fresh"). */
function board() {
  return scenario()
    .xp(P1, 2)
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: null })
    .hand(P1, INVESTIGATOR, "inv")
    .hand(P2, SKULKER, "a")
    .hand(P2, SKULKER, "b")
    .deck(P2, [NEW_CARD, NEW_CARD], ["fresh", "next"]);
}

/** P2's hand exactly as P1's live view shows it: "hidden" or the card id. */
function p2HandSeenByP1(game: Game): string[] {
  const cards: CardView[] = (game.p1.view().zones.hand ?? []).filter((c) => c.owner === P2);
  return cards.map((c) => (isHiddenView(c) ? "hidden" : c.id));
}

/** Play Investigator and let the trigger resolve up to P1's pick from the revealed hand. */
async function toThePick(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("inv");
  await game.acting().passPriority();
  await game.acting().passPriority();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed", source: { cardId: "inv" } });
  return game;
}

describe("Ruling 956dd54e47299258 — the card the opponent draws after the Investigator discard stays private", () => {
  test("on resolution P2's CURRENT hand {A, B} is revealed: both are named in P1's pick and visible in P1's view of P2's hand", async () => {
    const game = await toThePick();
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["a", "b"]);
    expect(p2HandSeenByP1(game).sort()).toEqual(["a", "b"]);
    expect(game.p1.xp()).toBe(2);
  });

  test("P1 pays 2 XP and picks A: A is discarded to P2's trash and P2 draws 'fresh' — and 'fresh' is NOT revealed: in P1's live view P2's hand is entirely anonymous again (B's revealed state ended with the ability, the new card never had one)", async () => {
    const game = await toThePick();
    await game.p1.pick("a");
    expect(game.p1.xp()).toBe(0);
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.p2.hand()).toEqual(["b", "fresh"]); // omniscient check: the draw happened
    const seen = p2HandSeenByP1(game);
    expect(seen).not.toContain("fresh");
    expect(seen).toEqual(["hidden", "hidden"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(p2HandSeenByP1(game)).toEqual(["hidden", "hidden"]);
    expect(game.p2.deck()[0]).toBe("next");
    expect(game.violations()).toEqual([]);
  });

  test("the public reveal record (if the engine keeps one) never names the freshly drawn card either", async () => {
    const game = await toThePick();
    await game.p1.pick("a");
    await game.settle();
    const rec = (game.gameState as { publicReveals?: { cardIds: readonly string[] }[] }).publicReveals ?? [];
    expect(rec.flatMap((r) => [...r.cardIds])).not.toContain("fresh");
  });
});
