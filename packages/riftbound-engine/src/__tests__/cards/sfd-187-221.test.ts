/**
 * Void Burrower — sfd-187-221 · Legend (Rek'Sai) · Fury/Order
 *
 *   When you conquer, you may exhaust me to reveal the top 2 cards of your Main Deck. You may
 *   banish one, then play it. Recycle the rest.          (errata: "banish one, then play it")
 *
 * Rules: 469.1 (Conquer = you gain control of a battlefield you have not scored this turn — by
 * walking onto an empty enemy field after its non-combat showdown closes, or by winning a combat),
 * 469.2 (Hold is NOT Conquer), 383.3.b (a leading "you may [exhaust me] to …": the yes/no AND the
 * exhaust are settled as the trigger is FINALIZED; "no" removes the item; an exhausted legend
 * cannot pay), 424 (Reveal is public; the revealed cards stay on the deck until dealt with), 427
 * (Banish), 419.2.a ("play it" pays the card's FULL cost — this card, unlike Void Rush, prints no
 * discount — so an unaffordable card cannot be banished-and-played), 416 (Recycle = bottom of the
 * Main Deck; the un-chosen card is recycled, NOT drawn), 359.2.c (a unit played this way enters
 * exhausted at a location you choose).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Cost timing: "yes" exhausts the legend at once, before anyone can respond; the reveal only
 *     happens on resolution, after P2 had priority. "no" leaves the legend ready for a later conquer.
 *  2. One exhaust per turn cycle: two conquers in one turn → the second trigger cannot be paid.
 *  3. Full price: 3 energy for a Skulker; with 2 energy neither Skulker is playable, nothing is
 *     banished, and BOTH are recycled — never drawn (that is Void Rush's text, not this one).
 *  4. "the rest": exactly the other revealed card (or both, if you decline) goes to the bottom; the
 *     third card becomes the new top; the hand never grows.
 *  5. Negative space: holding, the opponent conquering MY field, an already-exhausted legend.
 *  6. Engine status: trigger / option / exhaust-cost are wired; the reveal-banish-play-recycle
 *     effect is a `raw` (unimplemented) payload — those clauses are pinned as BUG tests below.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-187-221";
const SKULKER = "ogn-175-298"; // Unit · 3 energy · 3 Might (vanilla)
const FILLER = "ogn-175-298";

/** P1: Void Burrower, `energy`, a 2-Might walker in base, an EMPTY P2-controlled bf1, deck = [top, second, third]. */
function walkIn(energy = 3) {
  return scenario()
    .resources(P1, { energy })
    .legend(P1, CARD, "vb")
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Tunneler" }, "walker")
    .deck(P1, [SKULKER, SKULKER, FILLER], ["top", "second", "third"]);
}

/** Move onto bf1, close the non-combat showdown, conquer → stop at the legend's yes/no. */
async function conquerToPrompt(game: Game): Promise<Decision | null> {
  await game.p1.move("walker", "bf1");
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  return game.decision();
}

/** After "yes": pass priority until the revealed-cards prompt (or an open state). */
async function toReveal(game: Game): Promise<Decision | null> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main") {
      break;
    }
    await game.seat(d.seat).pass();
  }
  return game.decision();
}

/** Answer a played unit's location prompt with the base / take forced picks; pass priority until open. */
async function finish(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      return;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick" && d.options.some((o) => o.key === "base")) {
      await game.seat(d.seat).pick("base");
    } else if (d.kind === "pick" && d.options.length === 1) {
      await game.seat(d.seat).pick(d.options[0]?.key as string);
    } else if (d.kind === "pick" && d.allowDecline) {
      await game.seat(d.seat).decline();
    } else {
      return;
    }
  }
}

describe("Void Burrower (sfd-187-221)", () => {
  test("registry payload: Legend (Rek'Sai · Fury/Order) with ONE optional conquer trigger whose cost is 'exhaust me'", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Rek'Sai", domain: ["fury", "order"], name: "Void Burrower" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      condition: { cost: { exhaust: true }, type: "pay-cost" },
      optional: true,
      trigger: { event: "conquer", on: "controller" },
      type: "triggered",
    });
  });

  test("registry payload — the effect must be a structured reveal-2 / optional banish→play / recycle-the-rest instruction, not an unparsed `raw` text blob", async () => {
    // Expected (mirroring Void Rush sfd-188-221): { amount: 2, from: "deck", optional: true, onPicked: "play",
    // onRest: "recycle" } with a public reveal and NO cost reduction. Actual: { type: "raw", text: "reveal the top 2 …" }.
    const effect = (await loadDefaultCardPool()).get(CARD)?.abilities?.[0] as { effect: Record<string, unknown> };
    expect(effect.effect.type).not.toBe("raw");
    expect(effect.effect).toMatchObject({ amount: 2, from: "deck", onPicked: "play", onRest: "recycle", optional: true });
    expect(effect.effect.reduceCost).toBeUndefined();
  });

  test("walking onto an EMPTY enemy battlefield: after the showdown closes P1 conquers (+1 point) and is asked whether to exhaust the legend — nothing is revealed or exhausted before answering", async () => {
    const game = await walkIn().build();
    await game.p1.move("walker", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // 344: non-combat showdown first
    // rule 323.6 / 190.4.c — P2's unit-less (seeded) control lapsed in the Cleanup after the move,
    // BEFORE the showdown began (it was only staged then); P1 conquers the now-uncontrolled bf1 at its close.
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "vb" } });
    expect(game.state("vb").isExhausted).toBe(false);
    expect(game.p1.deck().slice(0, 3)).toEqual(["top", "second", "third"]);
    expect(game.p1.hand()).toEqual([]);
  });

  test("'yes' pays the cost at finalization (383.3.b): the legend is exhausted at once, the ability sits on the chain and P2 gets priority before it resolves", async () => {
    const game = await walkIn().build();
    await conquerToPrompt(game);
    await game.p1.yes();
    expect(game.state("vb").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vb", controller: P1, triggered: true, type: "ability" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.deck().slice(0, 3)).toEqual(["top", "second", "third"]); // still nothing revealed/moved
  });

  test("'no' (383.3.a.2): the item vanishes, the legend stays READY for a later conquer, deck/hand untouched, the point stands", async () => {
    const game = await walkIn().build();
    await conquerToPrompt(game);
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.state("vb").isExhausted).toBe(false);
    expect(game.p1.deck().slice(0, 3)).toEqual(["top", "second", "third"]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("conquering by WINNING A COMBAT (3 into a lone 2) triggers it too — the prompt arrives after combat, with bf1 already flipped", async () => {
    const game = await scenario()
      .legend(P1, CARD, "vb")
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Tunneler" }, "walker")
      .unit(P2, "bf1", { might: 2, name: "Sentry" }, "sentry")
      .build();
    const d = await conquerToPrompt(game);
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "vb" } });
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("walker")).toBe("battlefield-bf1");
    expect(game.p1.points()).toBe(1);
  });

  test("negative space — HOLDING is not conquering (469.2): my Beginning-Phase hold scores but raises no legend prompt", async () => {
    const game = await scenario().turn(2).active(P2).legend(P1, CARD, "vb").battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 3 }, "holder").build();
    await game.p2.endTurn();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.state("vb").isExhausted).toBe(false);
  });

  test("negative space — the OPPONENT conquering my battlefield is not 'you conquer': no prompt for me (nor for them off my legend)", async () => {
    const game = await scenario().active(P2).legend(P1, CARD, "vb").battlefield("bf1", { controller: P1 }).unit(P2, "base", { might: 2 }, "raider").build();
    await game.p2.move("raider", "bf1");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.state("vb").isExhausted).toBe(false);
  });

  test("negative space — legend ALREADY EXHAUSTED: the conquer still scores but the unpayable 'you may exhaust me' yields no acceptable prompt and nothing moves", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .card("vb", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "walker")
      .deck(P1, [SKULKER, SKULKER, FILLER], ["top", "second", "third"])
      .script(P1, [(d) => (d.kind === "yes-no" ? (d.canAccept === false ? "no" : undefined) : undefined)])
      .build();
    await game.p1.move("walker", "bf1");
    const r = await game.settle();
    expect(r.reason).toBe("open"); // an acceptable yes/no would have stopped settle as "unanswered"
    expect(game.p1.points()).toBe(1);
    expect(game.state("vb").isExhausted).toBe(true);
    expect(game.p1.deck().slice(0, 3)).toEqual(["top", "second", "third"]);
    expect(game.p1.energy()).toBe(3);
  });

  test("two conquers in one turn: the first 'yes' exhausts the legend, so the second conquer's trigger cannot be paid — no second acceptable prompt", async () => {
    const game = await scenario()
      .legend(P1, CARD, "vb")
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Tunneler" }, "walker")
      .unit(P1, "base", { might: 2, name: "Digger" }, "digger")
      .build();
    await conquerToPrompt(game);
    await game.p1.yes();
    await finish(game); // let the (currently empty) effect resolve
    expect(game.state("vb").isExhausted).toBe(true);
    expect(game.p1.points()).toBe(1);
    game.script(P1, [(d) => (d.kind === "yes-no" ? (d.canAccept === false ? "no" : undefined) : undefined)]);
    await game.p1.move("digger", "bf2");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    // Next turn cycle the legend readies again (Awaken) and the trigger is live once more.
    await game.advanceTurn();
    expect(game.state("vb").isExhausted).toBe(true); // still down during P2's turn
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("vb").isReady).toBe(true);
  });

  test("resolution — the top TWO cards are revealed and offered (optional pick); banishing 'second' plays that Skulker for its FULL 3 energy (enters base exhausted), 'top' is RECYCLED to the bottom (hand stays empty), 'third' is the new top", async () => {
    // Expected: a from-revealed pick over [top, second] with allowDecline; after picking "second" and
    // placing it in base: energy 3 → 0, second on the board exhausted, top at the bottom of the deck,
    // nothing drawn, banishment empty again. Actual: the effect is `raw` — the item resolves doing nothing.
    const game = await walkIn(3).build();
    await conquerToPrompt(game);
    await game.p1.yes();
    const d = await toReveal(game);
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["top", "second"]);
    expect(game.zoneOf("top")).toBe("mainDeck"); // revealed, not moved (424)
    await game.p1.pick("second");
    await finish(game);
    expect(game.zoneOf("second")).toBe("base");
    expect(game.state("second")).toMatchObject({ isExhausted: true, might: 3 });
    expect(game.p1.energy()).toBe(0); // full price — no discount printed on this card
    expect(game.p1.hand()).toEqual([]); // "Recycle the rest", not "draw"
    expect(game.p1.deck()[0]).toBe("third");
    expect(game.p1.deck().at(-1)).toBe("top");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("declining the banish recycles BOTH revealed cards to the bottom — nothing played, nothing drawn, 'third' on top, energy untouched", async () => {
    // Expected: after "yes" + decline: deck top = third, {top, second} are the bottom two (any order),
    // hand empty, base holds only the walker… Actual: no reveal prompt ever appears (raw effect).
    const game = await walkIn(3).build();
    await conquerToPrompt(game);
    await game.p1.yes();
    const d = await toReveal(game);
    expect(d?.kind).toBe("pick");
    await game.p1.decline();
    await finish(game);
    expect(game.p1.deck()[0]).toBe("third");
    expect(new Set(game.p1.deck().slice(-2))).toEqual(new Set(["top", "second"]));
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.base()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.energy()).toBe(3);
  });

  test("'then play it' at full cost (419.2.a) — with only 2 energy neither 3-cost Skulker may be banished-and-played; both are recycled and the 2 energy is kept", async () => {
    // Expected: the reveal happens (deck reordered: third on top, the two Skulkers at the bottom) but no
    // payable choice exists, so nothing reaches base/banishment. Actual: nothing happens at all — the
    // deck order is untouched because the raw effect never reveals.
    const game = await walkIn(2).build();
    await conquerToPrompt(game);
    await game.p1.yes();
    const d = await toReveal(game);
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card)).toEqual([]); // revealed, but neither is a legal (payable) pick
      await game.p1.decline();
    }
    await finish(game);
    expect(game.zoneOf("top")).toBe("mainDeck");
    expect(game.zoneOf("second")).toBe("mainDeck");
    expect(game.p1.deck()[0]).toBe("third");
    expect(game.p1.base()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.energy()).toBe(2);
  });
});
