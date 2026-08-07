/**
 * Disposal Order — unl-103-219 · Spell · Body · 2 energy
 *
 *   [Reaction] Choose one —
 *     Choose up to 3 cards from opponents' trashes. Their owners recycle them.
 *     Draw 1.
 *
 * Rules: "cards from opponents' trashes" scopes the pool to every OTHER player's trash
 * (416 — the caster's own trash is never eligible); "up to 3" means the caster chooses
 * 0–3 of them, so a prompt is offered even when the pool holds 3 or fewer; each chosen
 * card is recycled by its owner — bottom of that owner's Main Deck.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "unl-103-219";
const FILLER = "ogn-175-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .hand(P1, CARD, "order")
    .trash(P1, FILLER, "mine1")
    .trash(P1, FILLER, "mine2")
    .trash(P2, FILLER, "e1")
    .trash(P2, FILLER, "e2");
}

describe("Disposal Order (unl-103-219)", () => {
  test("mode 1 pools only opponents' trashes and prompts the caster to pick up to 3", async () => {
    const game = await board().build();
    const p1Deck = game.p1.deck().length;
    const p2Deck = game.p2.deck().length;
    await game.p1.cast("order");
    await game.settle();
    await game.p1.chooseMode(0);
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["e1", "e2"]);
    await game.p1.answer(["e1"]);
    await game.settle();
    expect(game.zoneOf("e1")).toBe("mainDeck");
    expect(game.p2.deck()[game.p2.deck().length - 1]).toBe("e1");
    expect(game.p2.deck()).toHaveLength(p2Deck + 1);
    expect(game.p2.trash()).toEqual(["e2"]);
    // the caster's own trash is untouched (plus the spell itself once it resolves)
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["mine1", "mine2"]));
    expect(game.p1.deck()).toHaveLength(p1Deck);
  });

  test("'up to 3' — the caster may recycle nothing", async () => {
    const game = await board().build();
    await game.p1.cast("order");
    await game.settle();
    await game.p1.chooseMode(0);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.decline();
    await game.settle();
    expect(game.p2.trash().sort()).toEqual(["e1", "e2"]);
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["mine1", "mine2"]));
  });

  test("mode 2 draws 1 and touches no trash", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.cast("order");
    await game.settle();
    await game.p1.chooseMode(1);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand); // -1 for the cast spell, +1 drawn
    expect(game.p2.trash().sort()).toEqual(["e1", "e2"]);
  });
});
