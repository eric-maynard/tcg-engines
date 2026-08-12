/**
 * Interaction: Sigil of the Storm (ogn-287-298) "When you conquer here, you must recycle one of
 *   your runes. (This doesn't choose anything.)"
 *   × Karma, Channeler (ogn-235-298) "When you recycle one or more cards to your Main Deck, buff a
 *     friendly unit. (… Runes aren't cards.)"
 *   × Battle Mistress (sfd-203-221, Legend) "When you recycle a rune, you may exhaust me to play a
 *     Gold gear token exhausted."
 *
 * Question: (a) which DECK does a recycled rune go to? (b) does Karma trigger? does Battle
 * Mistress? (c) and when the recycled card is a Main Deck card from Karma's own [Vision] instead,
 * which of the two fires?
 *
 * Answer: (a) the RUNE Deck. (b) Battle Mistress only. (c) Karma only.
 *
 * Rules:
 *  - 416.1 — Recycle = put on the BOTTOM of the corresponding deck.
 *  - 416.1.a — Main Deck cards are Recycled to the Main Deck.
 *  - 416.1.b — Runes are Recycled to the Rune Deck.
 *  - 416.1.c — each player Recycles to their OWN decks, whoever was instructed.
 *  - 161.1 — a Rune is not a Main Deck card, so a rune recycle is not a "card … to your Main Deck".
 *  - 469.1 — Conquer = gaining control of a battlefield not yet Scored this turn.
 *  - 426.1.b.1 — a unit that already has a Buff Counter does not get a second one.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SIGIL = "ogn-287-298";
const KARMA = "ogn-235-298"; // 6 + [order] · 6 Might · [Vision] + "recycle to your Main Deck ⇒ buff"
const BATTLE_MISTRESS = "sfd-203-221";

/** Sigil is a live (non-inert) neutral battlefield; walking a lone unit in conquers it. */
function sigilBoard() {
  return scenario()
    .battlefield("bf1", { controller: null, def: SIGIL, inert: false })
    .unit(P1, "base", { might: 3, name: "Walker" }, "walker")
    .unit(P1, "base", KARMA, "karma")
    .legend(P1, BATTLE_MISTRESS, "mistress")
    .runes(P1, "fury", 3);
}

/** Karma cast from hand: her [Vision] recycles a MAIN DECK card, which is the (c) side. */
function visionBoard() {
  return scenario()
    .resources(P1, { energy: 6, power: { order: 1 } })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .legend(P1, BATTLE_MISTRESS, "mistress")
    .runes(P1, "fury", 2)
    .hand(P1, KARMA, "karma");
}

describe("Sigil of the Storm × Karma × Battle Mistress — a rune recycles to the RUNE deck", () => {
  test("(a) the conquer trigger fires and the recycled rune lands on the BOTTOM of P1's own Rune Deck — never the Main Deck (416.1/.1.b/.1.c)", async () => {
    const game = await sigilBoard().build();
    const runeDeckBefore = game.p1.runeDeck().length;
    const mainDeckBefore = [...game.p1.deck()];
    const p2RuneDeckBefore = [...game.p2.runeDeck()];

    await game.p1.move("walker", "bf1"); // 469.1 — Conquer
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1 });
    // "you MUST recycle one of your runes" — the ready runes are the only choices and it can't be declined.
    expect((game.decision() as { options: { card?: string }[] }).options.map((o) => o.card).sort()).toEqual(["k1", "k2", "k3"]);

    await game.p1.pick("k1");
    await game.p1.yes(); // Battle Mistress's optional exhaust (below)
    await game.settle();

    expect(game.zoneOf("k1")).toBe("runeDeck");
    expect(game.p1.runeDeck()).toHaveLength(runeDeckBefore + 1);
    expect(game.p1.runeDeck().at(-1)).toBe("k1"); // 416.1 — the BOTTOM
    expect(game.p1.runes()).toEqual(["k2", "k3"]);
    expect(game.p1.deck()).toEqual(mainDeckBefore); // 416.1.a — the Main Deck is untouched
    expect(game.p2.runeDeck()).toEqual(p2RuneDeckBefore); // 416.1.c — P1's own decks only
    expect(game.violations()).toEqual([]);
  });

  test("(a) the Conquer itself still stands: P1 controls the Sigil and scores the point", async () => {
    const game = await sigilBoard().build();
    await game.p1.move("walker", "bf1");
    await game.settle();
    await game.p1.pick("k1");
    await game.p1.yes();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("(b) Karma does NOT trigger on a rune recycle — 'cards … to your Main Deck', and a Rune is not a Main Deck card (161.1)", async () => {
    const game = await sigilBoard().build();
    expect(game.state("karma").isBuffed).toBe(false);
    await game.p1.move("walker", "bf1");
    await game.settle();
    await game.p1.pick("k1");
    await game.p1.yes();
    await game.settle();
    expect(game.state("karma").isBuffed).toBe(false);
    expect(game.state("walker").isBuffed).toBe(false);
    // No buff prompt was ever raised for Karma's ability.
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.chain()).toEqual([]);
  });

  test("(b) Battle Mistress DOES trigger on the rune recycle: an optional exhaust that plays an EXHAUSTED Gold gear token", async () => {
    const game = await sigilBoard().build();
    await game.p1.move("walker", "bf1");
    await game.settle();
    await game.p1.pick("k1");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect((game.decision() as { prompt: string }).prompt).toContain("Battle Mistress");
    await game.p1.yes();
    await game.settle();
    expect(game.state("mistress").isExhausted).toBe(true);
    expect(game.p1.gear()).toHaveLength(1);
    expect(game.state(game.p1.gear()[0]!)).toMatchObject({ isExhausted: true, isToken: true });
  });

  test("(b) declining Battle Mistress's optional exhaust leaves her ready and makes no token — the rune is recycled either way", async () => {
    const game = await sigilBoard().build();
    await game.p1.move("walker", "bf1");
    await game.settle();
    await game.p1.pick("k2");
    await game.p1.no();
    await game.settle();
    expect(game.state("mistress").isExhausted).toBe(false);
    expect(game.p1.gear()).toEqual([]);
    expect(game.zoneOf("k2")).toBe("runeDeck"); // the "must recycle" is not conditional on her
  });

  test("(c) recycling a MAIN DECK card (Karma's own [Vision]) flips it: Karma buffs, Battle Mistress stays out (416.1.a)", async () => {
    const game = await visionBoard().build();
    const deckBefore = [...game.p1.deck()];
    const runeDeckBefore = [...game.p1.runeDeck()];
    await game.p1.play("karma");
    await game.settle();
    // [Vision]: look at the top card, you may recycle it.
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", min: 0, seat: P1 });
    const top = deckBefore[0]!;
    await game.p1.pick(top);
    // Karma's second ability now needs its buff target — Battle Mistress asks nothing.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect((game.decision() as { options: { card?: string }[] }).options.map((o) => o.card).sort()).toEqual(["ally", "karma"]);
    await game.p1.pick("ally");
    await game.settle();

    expect(game.state("ally").isBuffed).toBe(true);
    expect(game.p1.deck()).toHaveLength(deckBefore.length); // same cards, reordered
    expect(game.p1.deck().at(-1)).toBe(top); // 416.1 — the BOTTOM of the Main Deck
    expect(game.p1.runeDeck()).toEqual(runeDeckBefore); // 416.1.b — no rune moved
    expect(game.state("mistress").isExhausted).toBe(false);
    expect(game.p1.gear()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(c) Karma's buff obeys the one-buff rule: a unit that already carries a Buff Counter gets no second one (426.1.b.1)", async () => {
    const game = await visionBoard().unit(P1, "base", { might: 2, name: "Fresh" }, "fresh", { buffed: true }).build();
    expect(game.state("fresh").isBuffed).toBe(true);
    await game.p1.play("karma");
    await game.settle();
    await game.p1.pick(game.p1.deck()[0]!);
    await game.p1.pick("fresh");
    await game.settle();
    expect(game.state("fresh").isBuffed).toBe(true); // still exactly one buff
    expect(game.state("fresh").might).toBe(3); // 2 printed + the one buff it already had
    expect(game.violations()).toEqual([]);
  });

  test("the recycle prompt names the destination deck — a rune recycle reads 'bottom of your Rune Deck' (416.1/416.1.b), not a blanket 'recycle'", async () => {
    // The prompt the player answers states where the card is going, and the two cases read
    // differently — "Rune Deck" for a rune (416.1.b), "Main Deck" for a Main Deck card (416.1.a) —
    // so nobody reads the rune recycle as a card recycle Karma would see.
    const runeGame = await sigilBoard().build();
    await runeGame.p1.move("walker", "bf1");
    await runeGame.settle();
    expect((runeGame.decision() as { prompt: string }).prompt).toMatch(/Rune Deck/i);

    const cardGame = await visionBoard().build();
    await cardGame.p1.play("karma");
    await cardGame.settle();
    expect((cardGame.decision() as { prompt: string }).prompt).toMatch(/Main Deck/i);
  });
});
