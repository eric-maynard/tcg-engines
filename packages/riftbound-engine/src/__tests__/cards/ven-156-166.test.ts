/**
 * Lightning Rush — ven-156-166 · Spell · Order/Chaos · 1 energy
 *
 *   Look at the top 3 cards of your Main Deck. You may choose a card from among
 *   them and draw it. Put the rest into your trash.
 *   [Flow] [2][rainbow]
 *
 * Head-judge notes:
 *   1. "You may choose" (383.3.a.3) — the pick is DECLINABLE; nothing forces the draw.
 *   2. "Put the rest into your trash" (416.1) — the unpicked looked-at cards go to the
 *      trash, NOT to the bottom of the Main Deck (the default look destination).
 *   3. Declining still trashes all three.
 */

import { describe, expect, test } from "bun:test";
import { P1, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-156-166";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla unit

function inHand() {
  return scenario()
    .resources(P1, { energy: 5, power: { chaos: 2, order: 2 } })
    .hand(P1, CARD, "rush")
    .deck(P1, [FILLER, FILLER, FILLER, FILLER], ["c1", "c2", "c3", "c4"]);
}

describe("Lightning Rush (ven-156-166)", () => {
  test("parsed ability: look 3, optional pick, rest to trash", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    const abilities = (def?.abilities ?? []) as { type: string; effect?: Record<string, unknown> }[];
    const look = abilities
      .map((a) => a.effect as Record<string, unknown> | undefined)
      .find((e) => e?.type === "look");
    expect(look).toMatchObject({ amount: 3, from: "deck", onRest: "trash", optional: true });
  });

  // rule 416.1 — the picked card is drawn.
  test("picking a card draws it", async () => {
    const game = await inHand().build();
    await game.p1.play("rush");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("c1");
    await game.settle();
    expect(game.p1.hand()).toEqual(["c1"]);
  });

  // rule 128.4 / 424.1 — "Look at" is a PRIVATE view: nothing is revealed, so
  // the prompt is marked private and presentation layers must keep the cards
  // (and the pick) away from the opponent.
  test("the look prompt is marked private (rule 128.4)", async () => {
    const game = await inHand().build();
    await game.p1.play("rush");
    await game.settle();
    const pending = game.gameState.pendingChoice as {
      private?: boolean;
      prompter?: string;
      type?: string;
    };
    expect(pending.type).toBe("reveal-and-pick");
    expect(pending.private).toBe(true);
    expect(pending.prompter).toBe(P1);
  });

  // rule 383.3.a.3 — "You may choose": declining is legal and draws nothing.
  test("the pick can be declined", async () => {
    const game = await inHand().build();
    await game.p1.play("rush");
    await game.settle();
    const r = await game.p1.try((p) => p.decline());
    expect(r.ok).toBe(true);
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
  });

  // rule 416.1 — "Put the rest into your trash": the unpicked looked-at cards
  // go to the trash, NOT to the bottom of the Main Deck.
  test("unpicked looked-at cards go to the trash, not back into the deck", async () => {
    const game = await inHand().build();
    await game.p1.play("rush");
    await game.settle();
    await game.p1.pick("c1");
    await game.settle();
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["c2", "c3"]));
    expect(game.p1.deck()).not.toEqual(expect.arrayContaining(["c2", "c3"]));
    expect(game.p1.deck()[0]).toBe("c4");
  });

  test("declining still trashes all three looked-at cards", async () => {
    const game = await inHand().build();
    await game.p1.play("rush");
    await game.settle();
    await game.p1.decline();
    await game.settle();
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["c1", "c2", "c3"]));
    expect(game.p1.deck()).not.toEqual(expect.arrayContaining(["c1", "c2", "c3"]));
  });
});
