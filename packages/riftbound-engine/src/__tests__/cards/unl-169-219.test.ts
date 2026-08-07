/**
 * Ashe, Focused — unl-169-219 · Champion Unit (Ashe) · Order · 5 energy + [order] · 4 Might
 *
 *   When you play me, choose an opponent. They reveal their hand. Choose a card revealed this way and
 *   banish it. When they hold, return it to their hand (even if I'm no longer on the board).
 *
 * Rules: 383.4.a (play effects go on the chain after the unit lands), 424 (Reveal is temporary), 108.6.c
 * / banish (card goes to its OWNER's banishment), 469.2 + 383.4.d.2.b (a player "holds" when they keep
 * control of a battlefield through the start of THEIR Beginning Phase and gain the hold point; abilities
 * that reference "the player holding" trigger then), 383.4.d.2.c (still triggers if the point itself is
 * negated), delayed triggers survive their source leaving the board ("even if I'm no longer on the board").
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. The pick is MANDATORY and unrestricted by type — the whole opposing hand is on offer, nothing of
 *      the caster's; with an empty opposing hand the trigger resolves doing nothing.
 *   2. Banish, not discard: the card lands in P2's banishment (not trash), still owned by P2.
 *   3. The return clause is a delayed trigger keyed on THE OPPONENT holding: it fires at the start of
 *      P2's Beginning Phase only if P2 keeps a battlefield (and takes the point); if P2 controls nothing
 *      the card stays banished; and it fires even after Ashe has been killed.
 *   4. It is P2's hold, not P1's: P1 holding on P1's next turn returns nothing.
 *   5. Playing Ashe from the Champion Zone is still "playing me" — the reveal must fire there too.
 *   6. Cost: 5 energy + 1 order power exactly; enters exhausted; short on either → illegal.
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-169-219";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit
const CLEAVE = "ogn-004-298"; // a spell
const ZAP6 = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Obliterate",
  rulesText: "[Action] Deal 6 to a unit.",
  timing: "action",
} as const;

/** P1 to play Ashe from hand; P2 holds bf1 with a unit (so P2 WILL hold next turn) and has a 2-card hand. */
function board({ p2HoldsBf = true }: { p2HoldsBf?: boolean } = {}) {
  const b = scenario()
    .resources(P1, { energy: 5, power: { order: 1 } })
    .battlefield("bf1", { controller: p2HoldsBf ? P2 : null })
    .hand(P2, SKULKER, "theirUnit")
    .hand(P2, CLEAVE, "theirSpell")
    .hand(P1, SKULKER, "myOther")
    .hand(P1, CARD, "ashe");
  return p2HoldsBf ? b.unit(P2, "bf1", { might: 2, name: "Holder" }, "holder") : b;
}

async function playAndBanish(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>, pick = "theirSpell") {
  await game.p1.play("ashe", { to: "base" });
  const s = await game.settle();
  expect(s.reason).toBe("unanswered");
  await game.p1.pick(pick);
  await game.settle();
  expect(game.zoneOf(pick)).toBe("banishment");
}

describe("Ashe, Focused (unl-169-219)", () => {
  test("registry payload: 5+[order] 4-Might Ashe champion; a play-self trigger that reveals the opponent's hand and BANISHES the pick", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 5, isChampion: true, might: 4, name: "Ashe, Focused", tags: ["Ashe"] });
    expect(def?.powerCost).toEqual(["order"]);
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities[0]).toEqual({
      effect: { onPicked: "banish", returnOnHold: true, target: { type: "player", which: "opponent" }, type: "reveal-hand" },
      trigger: { event: "play-self" },
      type: "triggered",
    });
  });

  test("registry payload — the 'When they hold, return it to their hand' clause must be encoded (a delayed/linked trigger on the opponent's hold); today only the reveal-hand trigger exists", async () => {
    // Expected: a second ability (or a `then`/delayed rider on the first) describing return-to-hand on the
    // revealer's hold. Actual: abilities.length === 1 and nothing mentions hold.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(JSON.stringify(def?.abilities)).toMatch(/hold/i);
  });

  test("cost: 5 energy + 1 order deducted; Ashe lands in base exhausted as a 4 with her play trigger on the chain; short on power or energy → unplayable", async () => {
    const game = await board().build();
    await game.p1.play("ashe");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("ashe")).toBe("base");
    expect(game.state("ashe")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ashe", controller: P1, triggered: true })]);
    expect((await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "a").build()).p1.can("play", "a")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4, power: { order: 2 } }).hand(P1, CARD, "a").build()).p1.can("play", "a")).toBe(false);
  });

  test("resolution: P1 sees P2's WHOLE hand (unit and spell alike, nothing of P1's), must pick exactly one, and that card is BANISHED — P2's banishment, not trash; still owned by P2", async () => {
    const game = await board().build();
    await game.p1.play("ashe");
    expect((await game.settle()).reason).toBe("unanswered");
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1 });
    expect(d.options.map((o) => o.card).sort()).toEqual(["theirSpell", "theirUnit"]);
    expect((await game.p1.try((p) => p.decline())).ok).toBe(false);
    await game.p1.pick("theirUnit");
    await game.settle();
    expect(game.zoneOf("theirUnit")).toBe("banishment");
    expect(game.state("theirUnit").owner).toBe(P2);
    expect(game.p2.banishment()).toEqual(["theirUnit"]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.p2.hand()).toEqual(["theirSpell"]);
    expect(game.p1.hand()).toEqual(["myOther"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("empty opposing hand: the trigger resolves with nothing to reveal or banish and play continues", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { order: 1 } }).hand(P1, CARD, "ashe").build();
    await game.p1.play("ashe");
    expect((await game.settle()).reason).toBe("open");
    expect(game.p2.banishment()).toEqual([]);
    expect(game.zoneOf("ashe")).toBe("base");
  });

  test("playing Ashe from the Champion Zone is still 'playing me': cost paid, she lands in base, and the reveal-and-banish pick appears", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { order: 1 } })
      .champion(P1, CARD, "ashe")
      .hand(P2, CLEAVE, "theirSpell")
      .hand(P2, SKULKER, "theirUnit")
      .build();
    await game.p1.playChampion("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("ashe")).toBe("base");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("theirSpell");
    await game.settle();
    expect(game.zoneOf("theirSpell")).toBe("banishment");
  });

  test("'When they hold, return it to their hand' — P2 keeps bf1 into their Beginning Phase (hold point scored) → the banished card is back in P2's hand", async () => {
    // Expected: after P1's turn ends, P2 holds bf1 (+1 point) and theirSpell returns from banishment to P2's hand
    // (P2's hand = theirUnit + theirSpell + the draw-phase card). Actual: the return clause is not implemented;
    // the card stays banished.
    const game = await board().build();
    await playAndBanish(game, "theirSpell");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(1); // the hold happened
    expect(game.zoneOf("theirSpell")).toBe("hand");
    expect(game.p2.hand()).toEqual(expect.arrayContaining(["theirUnit", "theirSpell"]));
    expect(game.p2.banishment()).toEqual([]);
  });

  test("'(even if I'm no longer on the board)' — Ashe is killed before P2's turn; P2's hold still returns the card", async () => {
    // Expected: the delayed trigger is independent of Ashe; theirSpell returns on P2's hold. Actual: stays banished.
    const game = await board().hand(P1, ZAP6, "zap").build();
    await playAndBanish(game, "theirSpell");
    await game.p1.cast("zap", { targets: "ashe" }); // P1 removes her own Ashe the same turn
    await game.settle();
    expect(game.zoneOf("ashe")).toBe("trash");
    await game.advanceTurn(); // P2's Beginning Phase: P2 holds bf1
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.zoneOf("theirSpell")).toBe("hand");
    expect(game.p2.banishment()).toEqual([]);
  });

  test("negative space: P2 controls NO battlefield → no hold on P2's turn → the card stays banished (and P2 scores nothing)", async () => {
    const game = await board({ p2HoldsBf: false }).build();
    await playAndBanish(game, "theirSpell");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("theirSpell")).toBe("banishment");
    expect(game.p2.hand()).not.toContain("theirSpell");
  });

  test("negative space: it is THEIR hold, not yours — P1 holding bf2 at the start of P1's next turn returns nothing", async () => {
    const game = await board({ p2HoldsBf: false })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 2, name: "My Holder" }, "mine")
      .build();
    await playAndBanish(game, "theirSpell");
    await game.advanceTurn(); // P2 (holds nothing)
    await game.advanceTurn(); // P1 holds bf2
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("theirSpell")).toBe("banishment");
  });

  test("the banish is not 'this turn': with no hold ever happening the card is still banished three turns later", async () => {
    const game = await board({ p2HoldsBf: false }).build();
    await playAndBanish(game, "theirUnit");
    await game.advanceTurn();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("theirUnit")).toBe("banishment");
    expect(game.p2.banishment()).toEqual(["theirUnit"]);
  });
});
