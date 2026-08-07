/**
 * Poppy, Paragon — unl-116-219 · Champion Unit (Poppy) · Body · 5 energy (no power) · 5 Might
 *
 *   [Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *   When you play me, if an opponent's score is within 3 points of the Victory Score, ready me
 *   and gain 3 XP.
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. "if an opponent's score is within 3 points" is a conditional IMMEDIATELY after the trigger
 *      condition (383.2.a.1): it is part of the Condition, so with no opponent in range the ability
 *      is never even placed on the chain; when in range it resolves even if things change.
 *   2. Boundary: Victory Score 8 → opponent at 5 (exactly 3 away) qualifies, 4 does not; a custom
 *      Victory Score moves the window; YOUR OWN score being close is irrelevant ("an opponent's").
 *   3. Both halves of the effect: Poppy (who enters exhausted, 359.2) becomes READY and the
 *      controller gains exactly 3 XP — and neither happens on the negative branch.
 *   4. Deflect (809): opponents' spells that choose her cost 1 extra power of ANY domain, mandatory;
 *      her controller targets her for free; a dual-cost enemy spell (Keeper's Verdict, 2 +
 *      [rainbow][rainbow]) needs a THIRD power to name her.
 *   5. Ready-on-play matters: a readied Poppy can immediately take the Standard Move this turn.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-116-219";
const KEEPERS_VERDICT = "unl-204-219"; // [Action] 2 + [rainbow][rainbow]: enemy unit at a bf → owner's deck
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  rulesText: "[Action] Deal 2 to a unit.",
  timing: "action",
};

function inHand(oppPoints: number, victory = 8) {
  return scenario()
    .victoryScore(victory)
    .points(P2, oppPoints)
    .resources(P1, { energy: 5 })
    .battlefield("bf1", { controller: null })
    .hand(P1, CARD, "poppy");
}

describe("Poppy, Paragon (unl-116-219)", () => {
  test("registry payload: Deflect 1 + a play-self trigger gated on opponent-score-within-3 whose effect readies self and gains 3 XP", async () => {
    const game = await scenario().hand(P1, CARD, "poppy").build();
    expect(game.state("poppy")).toMatchObject({ baseMight: 5, cardType: "unit", energyCost: 5, name: "Poppy, Paragon" });
    expect(game.state("poppy").powerCost).toEqual([]);
    const abilities = peekDefaultCardPool()?.get(CARD)?.abilities as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toEqual({ keyword: "Deflect", type: "keyword", value: 1 });
    expect(abilities[1]).toMatchObject({
      condition: { type: "score-within", whose: "opponent" },
      effect: { effects: [{ target: "self", type: "ready" }, { amount: 3, type: "gain-xp" }], type: "sequence" },
      trigger: { event: "play-self" },
      type: "triggered",
    });
    const cond = abilities[1]?.condition as Record<string, unknown>;
    expect(cond.points ?? cond.range).toBe(3);
  });

  test("cost: 5 energy, no power; 4 energy is not enough", async () => {
    const game = await inHand(0).build();
    await game.p1.play("poppy");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("poppy")).toBe("base");
    expect(game.state("poppy").keywords).toContain("Deflect");
    const poor = await scenario().resources(P1, { energy: 4, power: { body: 2 } }).hand(P1, CARD, "poppy").build();
    expect(poor.p1.can("play", "poppy")).toBe(false);
  });

  test("opponent at 5 of 8 (exactly 3 away): the trigger resolves — Poppy is READY and P1 gains 3 XP", async () => {
    const game = await inHand(5).build();
    expect(game.p1.xp()).toBe(0);
    await game.p1.play("poppy");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poppy", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("poppy").isReady).toBe(true);
    expect(game.p1.xp()).toBe(3);
    expect(game.p2.xp()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("opponent at 7 of 8 (1 away) also qualifies", async () => {
    const game = await inHand(7).build();
    await game.p1.play("poppy");
    await game.settle();
    expect(game.state("poppy").isReady).toBe(true);
    expect(game.p1.xp()).toBe(3);
  });

  test("negative branch — opponent at 4 of 8 (4 away) must leave Poppy exhausted with no XP; the score-within gate is ignored", async () => {
    // Expected: condition false → no ready, no XP. Actual: the trigger's `score-within` condition is
    // not evaluated (unknown trigger conditions are permissive), so Poppy always readies and gains 3 XP.
    const game = await inHand(4).build();
    await game.p1.play("poppy");
    await game.settle();
    expect(game.zoneOf("poppy")).toBe("base");
    expect(game.state("poppy").isExhausted).toBe(true);
    expect(game.p1.xp()).toBe(0);
  });

  test("383.2.a.1 — out of range the ability must not be put on the chain at all; engine always chains it", async () => {
    // Expected: empty chain after the play (condition is part of the trigger Condition).
    // Actual: a triggered "Poppy, Paragon" item is on the chain regardless of scores.
    const game = await inHand(0).build();
    await game.p1.play("poppy");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("'an OPPONENT's score' — your own score within 3 must not satisfy the condition (gate currently ignored)", async () => {
    // Expected: P1 at 6/8 but P2 at 0 → no ready/XP. Actual: fires unconditionally.
    const game = await inHand(0).points(P1, 6).build();
    await game.p1.play("poppy");
    await game.settle();
    expect(game.state("poppy").isExhausted).toBe(true);
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.points()).toBe(6);
  });

  test("the window follows the actual Victory Score — at Victory 11 an opponent on 7 must NOT qualify (gate ignored)", async () => {
    // Expected: 8/11 qualifies (passes today), 7/11 does not (fails today: fires unconditionally).
    const yes = await inHand(8, 11).build();
    await yes.p1.play("poppy");
    await yes.settle();
    expect(yes.state("poppy").isReady).toBe(true);
    expect(yes.p1.xp()).toBe(3);
    const no = await inHand(7, 11).build();
    await no.p1.play("poppy");
    await no.settle();
    expect(no.state("poppy").isExhausted).toBe(true);
    expect(no.p1.xp()).toBe(0);
  });

  test("readied on play, Poppy can take the Standard Move to a battlefield the same turn", async () => {
    const game = await inHand(6).build();
    await game.p1.play("poppy");
    await game.settle();
    expect(game.state("poppy").isReady).toBe(true);
    await game.p1.move("poppy", "bf1");
    await game.settle();
    expect(game.locationOf("poppy")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Deflect: an opponent's spell cannot choose Poppy with no power to spare, but can hit the vanilla unit beside her", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", CARD, "poppy")
      .unit(P1, "base", { might: 3 }, "plain")
      .hand(P2, BOLT, "bolt")
      .build();
    const r = await game.p2.try((p) => p.cast("bolt", { targets: "poppy" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("bolt")).toBe("hand");
    await game.p2.cast("bolt", { targets: "plain" });
    expect(game.p2.energy()).toBe(0);
    await game.settle();
    expect(game.state("plain").damage).toBe(2);
    expect(game.state("poppy").damage).toBe(0);
  });

  test("Deflect: the opponent pays one power of ANY domain (809.1.c.1) on top of the spell's cost; Poppy takes the 2", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { chaos: 1 } })
      .unit(P1, "base", CARD, "poppy")
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "poppy" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.state("poppy").damage).toBe(2);
    expect(game.zoneOf("poppy")).toBe("base"); // 2 < 5: survives
  });

  test("Deflect taxes opponents only: Poppy's controller targets her at the printed cost", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "poppy").hand(P1, BOLT, "bolt").build();
    await game.p1.cast("bolt", { targets: "poppy" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("poppy").damage).toBe(2);
  });

  test("Deflect stacks on a spell's own power cost: an enemy Keeper's Verdict (2 + 2 power) needs a third power to name Poppy", async () => {
    const two = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "poppy")
      .hand(P2, KEEPERS_VERDICT, "kv")
      .build();
    expect((await two.p2.try((p) => p.cast("kv", { targets: "poppy" }))).ok).toBe(false);
    expect(two.zoneOf("kv")).toBe("hand");
    const three = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { rainbow: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "poppy")
      .hand(P2, KEEPERS_VERDICT, "kv")
      .build();
    await three.p2.cast("kv", { targets: "poppy" });
    expect(three.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await three.settle();
    // Poppy's OWNER (P1) places her; either answer takes her off the battlefield into P1's deck.
    if (three.decision()?.kind === "pick" && three.actingSeat() === P1) {
      await three.p1.answer("mainDeck-bottom");
      await three.settle();
    }
    expect(three.zoneOf("poppy")).toBe("mainDeck");
    expect(three.state("poppy").owner).toBe(P1);
  });
});
