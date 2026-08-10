/**
 * Ruling ce6845fe7b578ad5 — Baited Hook (ogn-242-298) × Karma, Channeler (ogn-235-298)
 *   Baited Hook — Gear: "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may
 *   banish a unit from among them that has Might up to 1 more than the killed unit and play it, ignoring its cost. Then
 *   recycle the rest."
 *   Karma — Unit · [6] · 6 Might: "[Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)
 *   When you recycle one or more cards to your Main Deck, buff a friendly unit."
 *
 * Q: Baited Hook banishes and plays Karma — does Karma "see" the cards the Hook recycles, and when does her Vision go off?
 * A: The Hook must finish resolving completely (including "recycle the rest") before Karma finalizes/resolves; her
 *    Vision is a When-You-Play-Me trigger that happens after that — so by the time it looks, the recycled cards are
 *    already back in the deck and Vision can see them.
 * Rules: 354.2–354.3 / 337 (played mid-resolution → pending until the resolving item finishes), 340, 383.4 (WYPM after).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const KARMA = "ogn-235-298";
const BIG = { cardType: "unit", energyCost: 7, might: 7, name: "Too Big" } as const;

/**
 * P1's turn: Hook ready, exactly [1][order], a 5-Might Bait in base (ceiling 6 → Karma qualifies). P1's Main Deck is
 * EXACTLY five cards, top→ Karma, b1, b2, b3, b4 (7-Might, ineligible) — so after "recycle the rest" the deck consists
 * only of recycled cards and whatever Vision looks at is one of them.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", { might: 5, name: "Bait" }, "bait")
    .unit(P2, "base", { might: 3, name: "Onlooker" }, "onlooker")
    .fillDecks({ main: 5, runes: 12 })
    .deck(P1, [KARMA, BIG, BIG, BIG, BIG], ["karma", "b1", "b2", "b3", "b4"]);
}

/** Activate the Hook on the Bait, both pass → it resolves up to the look-at-5 offer. */
async function hookToOffer(): Promise<{ game: Game; offer: Extract<Decision, { kind: "pick" }> }> {
  const game = await board().build();
  expect(game.p1.deck()).toEqual(["karma", "b1", "b2", "b3", "b4"]);
  await game.p1.activate("hook", 0, { targets: "bait" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "hook" } });
  return { game, offer: d as Extract<Decision, { kind: "pick" }> };
}

describe("Ruling ce6845fe7b578ad5 — Karma fetched by Baited Hook resolves only after the Hook (recycle included); her Vision then sees the recycled cards", () => {
  test("Hook resolving: the 5-Might Bait is dead and the look-at-5 offers Karma (6 ≤ 5+1) — the 7-Might cards are not eligible; it is a 'you may'", async () => {
    const { game, offer } = await hookToOffer();
    expect(game.zoneOf("bait")).toBe("trash");
    expect(offer.options.map((o) => o.card ?? o.key)).toEqual(["karma"]);
    expect(offer.allowDecline).toBe(true);
  });

  test("choosing Karma: she is played for free, and the Hook FINISHES — the other four are already recycled (they are the whole deck now) — while Karma's Vision is merely a pending/triggered item that has not looked at anything yet", async () => {
    const { game } = await hookToOffer();
    await game.p1.pick("karma");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // ignoring its cost
    expect(game.zoneOf("karma")).toBe("base");
    expect(game.state("karma").controller).toBe(P1);
    expect(new Set(game.p1.deck())).toEqual(new Set(["b1", "b2", "b3", "b4"])); // "recycle the rest" done
    expect(game.p1.banishment()).toEqual([]); // banished-then-played, not left in banishment
    expect(game.chain().some((c) => c.cardId === "hook")).toBe(false); // the Hook has fully resolved
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "karma", controller: P1, triggered: true })]); // Vision waits on the chain
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // nobody has looked yet
    // Karma was not on the board when the Hook recycled, so her own recycle trigger did not fire off it.
    expect(game.state("karma").isBuffed).toBe(false);
  });

  test("Vision resolves AFTER all that: the card it shows P1 is one of the cards the Hook just recycled (the deck is nothing else), and P1 may recycle it or not", async () => {
    const { game } = await hookToOffer();
    await game.p1.pick("karma");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "karma" } });
    const shown = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(shown).toHaveLength(1);
    expect(["b1", "b2", "b3", "b4"]).toContain(shown[0] as string); // Vision "sees" a recycled card
    expect(shown[0]).toBe(game.p1.deck()[0] as string); // it is the current top card
    expect(d?.kind === "pick" ? d.allowDecline : false).toBe(true);
    await game.p1.decline();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("karma")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
