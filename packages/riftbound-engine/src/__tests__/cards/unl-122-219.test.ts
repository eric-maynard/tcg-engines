/**
 * Crescent Guardian — unl-122-219 · Unit · Chaos · 4 energy (no power) · 4 Might
 *
 *   If you've played a spell this turn, you may pay [chaos] as an additional cost to play me.
 *   If you do, I enter ready.
 *
 * Rules: 356.2.b.1 (an OPTIONAL additional cost — "may" — chosen in step 2 of playing the card and
 * paid with the rest of the cost), 364.3.a (the offer itself is gated by an "if" condition: YOU
 * played a spell THIS turn), 369.3 / 805.2.b ("I enter ready" is a replacement on how the unit enters,
 * exactly like a paid Accelerate; units otherwise enter exhausted, 143.4), 356.4.f.1 (an optional cost
 * "was paid" if the player chose to pay it), 191.1 ("you've played" — the player who played the spell).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. TWO gates, both required: (a) a spell was played by ME earlier THIS turn, and (b) I chose to
 *     pay the extra [chaos]. Spell but no payment → exhausted, chaos untouched. Payment offered only
 *     after a spell — with no spell the [chaos] variant must not even be on the menu.
 *  2. Whose spell / which turn: the OPPONENT reacting with a spell on my turn is not "you've played";
 *     my own spell from LAST turn has expired across game.advanceTurn().
 *  3. Affordability of the option: spell played but 0 chaos in the pool → only the plain 4-energy play
 *     is legal; the Guardian still comes down (exhausted). 3 energy → nothing is legal.
 *  4. The payoff is tempo: entering READY means it can take its Standard Move the same turn — cast,
 *     play for 4+[chaos], walk onto an open battlefield, conquer.
 *  5. Parser check: the registry must carry the [chaos] additional-cost option and tie enter-ready to
 *     paying it — a bare `custom` text condition silently drops half the card.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-122-219";

/** Inline vanilla spells — "a spell" is all the Guardian asks about. */
const CANTRIP = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Test Cantrip",
  rulesText: "[Action] Draw 1.",
  timing: "action",
};
const REACTION_CANTRIP = { ...CANTRIP, name: "Test Reaction Cantrip", rulesText: "[Reaction] Draw 1.", timing: "reaction", abilities: [{ effect: { amount: 1, type: "draw" }, timing: "reaction", type: "spell" }] };

/** P1's main phase: 4 energy + `chaos` power, the Guardian and a 0-cost cantrip in hand, bf1 open. */
function board(chaos = 1, energy = 4) {
  return scenario()
    .resources(P1, { energy, power: { chaos } })
    .battlefield("bf1", { controller: null })
    .hand(P1, CANTRIP, "cantrip")
    .hand(P1, CARD, "cg");
}

const payOffered = (game: { p1: { option: (v: string, c: string) => { fields: readonly { arg: string; options?: readonly unknown[] }[] } | undefined } }) =>
  (game.p1.option("play", "cg")?.fields.find((f) => f.arg === "payOptional")?.options ?? []).includes(true);

describe("Crescent Guardian (unl-122-219)", () => {
  test("baseline cost with NO spell played: 4 energy, no power; enters the base EXHAUSTED as a 4-Might unit; the [chaos] option is not on the menu; 3 energy is not enough", async () => {
    const game = await board().build();
    expect(payOffered(game)).toBe(false);
    expect((await game.p1.try((p) => p.play("cg", { payOptional: true, to: "base" }))).ok).toBe(false);
    expect(game.zoneOf("cg")).toBe("hand");
    await game.p1.play("cg", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1 } });
    await game.settle();
    expect(game.state("cg")).toMatchObject({ baseMight: 4, isExhausted: true, might: 4, zone: "base" });
    expect(game.chain()).toEqual([]);
    expect((await board(1, 3).build()).p1.can("play", "cg")).toBe(false);
  });

  // Expected (356.2.b.1 + 369.3): after my cantrip resolves, play("cg", {payOptional:true}) is legal,
  // charges 4 energy + 1 chaos and the Guardian enters READY. Actual: the ability parsed to a static
  // enter-ready behind an unevaluable `custom` text condition — no additional-cost variant exists,
  // so the pay request is rejected.
  test("after playing a spell this turn, paying the extra [chaos] (4 energy + 1 chaos) makes the Guardian enter READY (356.2.b.1, 369.3)", async () => {
    const game = await board().build();
    await game.p1.cast("cantrip");
    await game.settle();
    expect(game.zoneOf("cantrip")).toBe("trash");
    expect(payOffered(game)).toBe(true);
    await game.p1.play("cg", { payOptional: true, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.state("cg")).toMatchObject({ isExhausted: false, isReady: true, might: 4, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  // Expected: the tempo payoff — a READY Guardian takes its Standard Move the same turn and conquers
  // the open bf1 (+1 point). Actual: see above — it cannot enter ready, so the move is never legal.
  test("the ready Guardian moves out the same turn — cantrip, play for 4+[chaos], move to open bf1, conquer (+1 point)", async () => {
    const game = await board().build();
    await game.p1.cast("cantrip");
    await game.settle();
    await game.p1.play("cg", { payOptional: true, to: "base" });
    await game.settle();
    await game.p1.move("cg", "bf1");
    await game.settle();
    expect(game.locationOf("cg")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("spell played but the option DECLINED: 4 energy only, chaos kept, enters exhausted (356.4.f.1 — not paid, no replacement)", async () => {
    const game = await board().build();
    await game.p1.cast("cantrip");
    await game.settle();
    await game.p1.play("cg", { payOptional: false, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1 } });
    await game.settle();
    expect(game.state("cg")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.can("move")).toBe(false); // nothing ready to move
  });

  test("spell played but ZERO chaos in the pool: the option cannot be taken; the plain play is still legal and the Guardian enters exhausted", async () => {
    const game = await board(0).build();
    await game.p1.cast("cantrip");
    await game.settle();
    expect(game.p1.can("play", "cg")).toBe(true);
    expect(payOffered(game)).toBe(false);
    expect((await game.p1.try((p) => p.play("cg", { payOptional: true, to: "base" }))).ok).toBe(false);
    await game.p1.play("cg", { to: "base" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.state("cg").isExhausted).toBe(true);
  });

  test("negative space — only the OPPONENT played a spell this turn (P2 reacts to my unit's play trigger): my Guardian gets no [chaos] option and enters exhausted", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { chaos: 1 } })
      .hand(P1, "unl-092-219", "dip") // Demacian Diplomat: When you play me, gain 1 XP (a trigger P2 can react to)
      .hand(P1, CARD, "cg")
      .hand(P2, REACTION_CANTRIP, "theirs")
      .build();
    await game.p1.play("dip");
    expect(game.chain()).toHaveLength(1);
    await game.p1.passPriority();
    await game.p2.cast("theirs");
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.p1.xp()).toBe(1);
    expect(payOffered(game)).toBe(false);
    expect((await game.p1.try((p) => p.play("cg", { payOptional: true, to: "base" }))).ok).toBe(false);
    await game.p1.play("cg", { to: "base" });
    await game.settle();
    expect(game.state("cg").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1 } });
  });

  test("negative space — 'THIS turn': a spell I played on my previous turn has expired across two game.advanceTurn()s; no option, enters exhausted", async () => {
    const game = await board().build();
    await game.p1.cast("cantrip");
    await game.settle();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 again (pool was emptied; channel 2 + whatever)
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 4, power: { chaos: 1 } });
    expect(payOffered(game)).toBe(false);
    expect((await game.p1.try((p) => p.play("cg", { payOptional: true, to: "base" }))).ok).toBe(false);
    await game.p1.play("cg", { to: "base" });
    await game.settle();
    expect(game.state("cg").isExhausted).toBe(true);
    expect(game.p1.power("chaos")).toBeGreaterThanOrEqual(1); // the chaos was never charged
  });

  // Expected: the registry encodes what is printed — an optional additional cost of one [chaos]
  // power, gated on having played a spell this turn, whose payment makes the unit enter ready.
  // Actual: `[{ type:"static", condition:{ type:"custom", text:"If you've played a spell this turn,
  // you may pay :rb_rune_chaos: as an additional cost to play me. If you do" }, effect: enter-ready }]`
  // — the cost, its optionality and the spell condition are all lost in free text.
  test("parsed abilities drop the [chaos] additional cost and the spell-played gate into an unevaluable `custom` text condition", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 4, might: 4, name: "Crescent Guardian" });
    expect(def?.powerCost ?? []).toEqual([]); // the [chaos] is an ADDITIONAL cost, not part of the base cost
    const json = JSON.stringify(def?.abilities ?? []);
    expect(json).toContain("enter-ready");
    expect(json).not.toContain('"type":"custom"');
    expect(json).toMatch(/"chaos"/); // the additional cost's power pip, as structured data
    expect(json).toMatch(/spell/); // the played-a-spell-this-turn gate, as a typed condition
  });
});
