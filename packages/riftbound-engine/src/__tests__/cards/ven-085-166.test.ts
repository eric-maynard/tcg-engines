/**
 * Decree of Strength — ven-085-166 · Spell · Body · 1 energy
 *
 *   Choose an opponent. They reveal their hand and you choose a Mind ([mind]) card from it. They recycle
 *   that card.
 *
 * Sibling: Sabotage (ogn-156-298) — same shape with "non-unit" instead of "Mind" as the pick filter.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. The pick filter is a DOMAIN, not a card type: Mind units, Mind spells and Mind gear are all fair game;
 *     a two-domain card that includes Mind (Fox-Fire, Calm/Mind) IS a Mind card; Fury/Chaos/Body cards are
 *     revealed but can never be chosen.
 *  2. Recycle (416.1.a): the chosen card goes to the bottom of its OWNER's Main Deck — not to the trash
 *     (that would be "discard"), not to the caster's deck. The rest of the hand stays put.
 *  3. "you choose a Mind card" is mandatory when one exists (no decline); with NO Mind card in the revealed
 *     hand (or an empty hand) the choose/recycle instructions are simply skipped (359.3.e.11) and the spell
 *     still resolves to the trash.
 *  4. The CASTER chooses (P1's pick decision), the OPPONENT recycles — seat of the prompt matters.
 *  5. No [Action]/[Reaction]: standard speed only — own turn, Neutral Open, not inside a showdown.
 *  6. Cost: exactly 1 energy, no power pip.
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-085-166";
const MIND_UNIT = "ogn-088-298"; // Mega-Mech · Mind unit
const MIND_SPELL = "ogn-095-298"; // Stupefy · Mind spell
const CALM_MIND_SPELL = "ogn-256-298"; // Fox-Fire · Calm/Mind spell
const FURY_SPELL = "ogn-004-298"; // Cleave · Fury spell
const CHAOS_UNIT = "ogn-175-298"; // Shipyard Skulker · Chaos unit

/** P1 (1 energy) holds the Decree + a Mind card of their own; P2 holds 2 Mind, 1 Calm/Mind and 2 off-domain cards. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .hand(P1, CARD, "decree")
    .hand(P1, MIND_SPELL, "myMind")
    .hand(P2, MIND_UNIT, "mech")
    .hand(P2, MIND_SPELL, "stupefy")
    .hand(P2, CALM_MIND_SPELL, "foxfire")
    .hand(P2, FURY_SPELL, "cleave")
    .hand(P2, CHAOS_UNIT, "skulker");
}

describe("Decree of Strength (ven-085-166)", () => {
  test("costs exactly 1 energy (no power): deducted on cast, one non-triggered chain item; 0 energy → not castable", async () => {
    const game = await board().build();
    await game.p1.cast("decree");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "decree", controller: P1, triggered: false })]);
    expect((await board().resources(P1, { energy: 0 }).build()).p1.can("cast", "decree")).toBe(false);
  });

  test("timing: standard speed — not castable on the opponent's turn, nor inside a showdown on your own turn", async () => {
    expect((await board().active(P2).build()).p1.can("cast", "decree")).toBe(false);
    const sd = await board().battlefield("bf1", { controller: P2 }).unit(P1, "base", { might: 2 }, "scout").unit(P2, "bf1", { might: 3 }, "guard").build();
    await sd.p1.move("scout", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(sd.p1.can("cast", "decree")).toBe(false);
  });

  // BUG — expected: on resolution P1 (the caster) gets a mandatory pick over exactly the opponent's MIND cards —
  // Mega-Mech, Stupefy and the Calm/Mind Fox-Fire — never Cleave/Skulker and never P1's own Mind card.
  // Actual: the card reached the engine with no abilities at all, so it resolves as a blank and no prompt appears.
  test("the caster is offered exactly the opponent's Mind cards (incl. the two-domain Fox-Fire), nothing else, and may not decline", async () => {
    const game = await board().build();
    await game.p1.cast("decree");
    const settled = await game.settle();
    expect(settled.reason).toBe("unanswered");
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1 });
    expect(d.allowDecline).toBe(false);
    expect([...d.options.map((o) => o.card)].sort()).toEqual(["foxfire", "mech", "stupefy"]);
    expect((await game.p1.try((p) => p.pick("cleave"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.decline())).ok).toBe(false);
  });

  // BUG — expected (416.1.a): the chosen Mind card is RECYCLED — bottom of P2's main deck — not trashed; the other
  // four cards stay in P2's hand; P1's hand only lost the Decree; the Decree itself ends in P1's trash.
  test("picking Stupefy recycles it to the BOTTOM of its owner's deck; rest of the hand untouched; Decree to trash", async () => {
    const game = await board().build();
    const deckBefore = game.p2.deck().length;
    await game.p1.cast("decree");
    await game.settle();
    await game.p1.pick("stupefy");
    await game.settle();
    expect(game.zoneOf("stupefy")).toBe("mainDeck");
    expect(game.p2.deck().at(-1)).toBe("stupefy");
    expect(game.p2.deck()).toHaveLength(deckBefore + 1);
    expect(game.p2.trash()).toEqual([]);
    expect([...game.p2.hand()].sort()).toEqual(["cleave", "foxfire", "mech", "skulker"]);
    expect(game.p1.hand()).toEqual(["myMind"]);
    expect(game.p1.deck()).not.toContain("stupefy");
    expect(game.zoneOf("decree")).toBe("trash");
    expect(game.decision()?.kind).toBe("action");
  });

  // BUG — expected: card TYPE is irrelevant to the filter — a Mind UNIT (Mega-Mech) is a legal pick and is recycled.
  test("a Mind UNIT is as choosable as a Mind spell — Mega-Mech goes to the bottom of P2's deck", async () => {
    const game = await board().build();
    await game.p1.cast("decree");
    await game.settle();
    await game.p1.pick("mech");
    await game.settle();
    expect(game.zoneOf("mech")).toBe("mainDeck");
    expect(game.p2.deck().at(-1)).toBe("mech");
    expect(game.p2.hand()).not.toContain("mech");
  });

  // BUG — expected: the two-domain Calm/Mind Fox-Fire counts as "a Mind card" and can be the one recycled.
  test("a multi-domain card that includes Mind (Fox-Fire) can be chosen and recycled", async () => {
    const game = await board().build();
    await game.p1.cast("decree");
    await game.settle();
    await game.p1.pick("foxfire");
    await game.settle();
    expect(game.zoneOf("foxfire")).toBe("mainDeck");
    expect(game.p2.hand()).toHaveLength(4);
  });

  test("opponent holds NO Mind card: nothing can be chosen or recycled — their hand is intact, no card reaches their deck bottom, Decree still resolves to the trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .hand(P1, CARD, "decree")
      .hand(P2, FURY_SPELL, "cleave")
      .hand(P2, CHAOS_UNIT, "skulker")
      .build();
    const bottomBefore = game.p2.deck().at(-1);
    await game.p1.cast("decree");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      // Only an empty / declinable prompt is acceptable here — never an off-domain card.
      expect((game.decision() as PickDecision).options.map((o) => o.card)).toEqual([]);
      await game.p1.decline();
      await game.settle();
    }
    expect([...game.p2.hand()].sort()).toEqual(["cleave", "skulker"]);
    expect(game.p2.deck().at(-1)).toBe(bottomBefore);
    expect(game.p2.trash()).toEqual([]);
    expect(game.zoneOf("decree")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("opponent with an EMPTY hand: the spell is still castable (the opponent is the only target), resolves doing nothing, and goes to the trash", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "decree").build();
    expect(game.p1.can("cast", "decree")).toBe(true);
    await game.p1.cast("decree");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.p2.hand()).toEqual([]);
    expect(game.zoneOf("decree")).toBe("trash");
  });

  // BUG (parse) — expected: the same primitive Sabotage uses — a `spell` ability with a `reveal-hand` effect on
  // an opponent, a Mind-domain pick filter and `onPicked: "recycle"`. Actual: `abilities` is absent entirely
  // (parser produced nothing for this text), so the spell is a 1-cost blank.
  test("registry payload — reveal-hand (opponent) + Mind filter + onPicked recycle", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "body", energyCost: 1, name: "Decree of Strength", timing: "standard" });
    expect(def?.powerCost ?? []).toEqual([]);
    const abilities = (def?.abilities ?? []) as { type?: string; effect?: { type?: string; onPicked?: string; target?: unknown } }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]?.type).toBe("spell");
    expect(abilities[0]?.effect).toMatchObject({ onPicked: "recycle", target: { type: "player", which: "opponent" }, type: "reveal-hand" });
    expect(JSON.stringify(abilities[0]?.effect)).toMatch(/mind/i);
  });
});
