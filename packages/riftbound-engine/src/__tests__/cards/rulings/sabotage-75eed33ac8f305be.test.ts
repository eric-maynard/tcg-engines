/**
 * Ruling 75eed33ac8f305be — Sabotage (OGN-156 → ogn-156-298) · Action · [1]+[body]
 *     "Choose an opponent. They reveal their hand. Choose a non-unit card from it, and recycle that card."
 *   × Karma, Channeler (OGN-235 → ogn-235-298) · 6 Might · "When you recycle one or more cards to your Main Deck, buff a friendly unit."
 *
 * Q: I control Karma and Sabotage a card out of my opponent's hand into THEIR deck — does my Karma trigger?
 * A: No. The card is recycled into the opponent's deck (only a card's owner recycles it into their own deck), so "you recycle …
 *    to your Main Deck" is not met for the caster. Conversely, if the opponent Sabotages YOU while you control Karma, the card goes
 *    into your deck and your Karma DOES trigger.
 * Rules: 409 (recycle = to the bottom of its OWNER's deck), 376–377 (trigger conditions).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SABOTAGE = "ogn-156-298";
const KARMA = "ogn-235-298";
const JUNK_SPELL = { cardType: "spell", energyCost: 9, name: "Junk Spell", timing: "action" } as const;

describe("Ruling 75eed33ac8f305be — Sabotage only triggers the Karma of the player whose deck receives the card", () => {
  test("P1 (with Karma) Sabotages P2: P2's spell is recycled to the bottom of P2's deck — P1's Karma does NOT trigger, nobody is buffed", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", KARMA, "karma")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, SABOTAGE, "sab")
      .hand(P2, JUNK_SPELL, "theirSpell")
      .hand(P2, { cardType: "unit", energyCost: 1, might: 1, name: "Their Unit" }, "theirUnit")
      .build();
    const p1DeckBefore = game.p1.deck().length;
    await game.p1.cast("sab");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("theirSpell");
      await game.settle();
    }
    expect(game.zoneOf("theirSpell")).toBe("mainDeck");
    expect(game.p2.deck().at(-1)).toBe("theirSpell"); // bottom of its OWNER's deck
    expect(game.p1.deck()).toHaveLength(p1DeckBefore);
    // No Karma trigger: no chain item, no buff prompt, no buff.
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("karma").isBuffed).toBe(false);
    expect(game.state("ally").isBuffed).toBe(false);
    expect(game.state("ally").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("mirror: P2 Sabotages P1 while P1 controls Karma — P1's spell goes into P1's deck, so P1's Karma triggers and P1 buffs a friendly unit", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { body: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", KARMA, "karma")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P2, SABOTAGE, "sab")
      .hand(P1, JUNK_SPELL, "mySpell")
      .build();
    await game.p2.cast("sab");
    await game.settle();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("mySpell");
    }
    // Karma's trigger: P1 (Karma's controller) chooses which friendly unit to buff.
    const stop = await game.settle();
    expect(game.zoneOf("mySpell")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("mySpell");
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "karma" } });
    const offered = game.decision()?.kind === "pick" ? (game.decision() as { options: { card?: string; key: string }[] }).options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["ally", "karma"]);
    await game.p1.pick("ally");
    await game.settle();
    expect(game.state("ally")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("karma").isBuffed).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
