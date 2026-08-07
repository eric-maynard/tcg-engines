/**
 * Sett, Brawler — ven-sp4-006 · Champion Unit (Sett) · Body · 5 energy + [body] · 4 Might
 *
 *   When you play me or when I conquer, buff me.
 *   Spend my buff: Give me +4 [Might] this turn.
 *
 * Head-judge checklist for this card:
 *  - Two triggers off one sentence (383.4.a play effect / 383.4.c conquer effect); a buff is a single
 *    +1 counter, max one (702.3) — conquering while already buffed does nothing extra (426.1.c).
 *  - "Spend my buff" is the COST (702.2.b): the buff leaves as the ability is activated, before it
 *    resolves, so a buffed 5-Might Sett is a plain 4 while the pump is on the chain, then 8 (not 9).
 *    An opponent may respond in that window (377.3.b.2) and kill a 4-Might Sett.
 *  - No buff → the cost is unpayable → the ability is not offered (702.2.b.1); one pump per buff.
 *  - Timing (381 / 331.1.b / 343.1.b): a plain activated ability is your-turn, Open, NEUTRAL state
 *    only — not on the opponent's turn, not with a chain open, not during a showdown. So the pump has
 *    to happen before the attack; the +4 then carries into combat and expires at end of turn.
 *  - Full line: pump in base (8), attack a 7-Might defender, win, conquer → the conquer trigger
 *    re-buffs him (so he could pump again next turn).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-sp4-006";
/** Opponent's instant-speed removal for the response window. */
const SNIPE = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Snipe",
  rulesText: "[Reaction] Deal 4 to a unit.",
  timing: "reaction",
} as const;

describe("Sett, Brawler (ven-sp4-006)", () => {
  test("registry payload should carry BOTH the play/conquer buff trigger and the spend-buff pump (parser dropped the trigger)", async () => {
    // Expected: same shape as the OGN printing (ogn-164-298). Actual: only the activated ability.
    const game = await scenario().hand(P1, CARD, "sett").build();
    expect(game.state("sett")).toMatchObject({ baseMight: 4, cardType: "unit", energyCost: 5, name: "Sett, Brawler", powerCost: ["body"] });
    expect(peekDefaultCardPool()?.get(CARD)?.abilities).toEqual([
      { effect: { target: "self", type: "buff" }, trigger: { event: "play-self-or-conquer", on: "self" }, type: "triggered" },
      { cost: { spend: "buff" }, effect: { amount: 4, duration: "turn", target: "self", type: "modify-might" }, type: "activated" },
    ]);
  });

  test("cost: 5 energy + 1 body, enters the base exhausted as a 4-Might unit; short on either resource → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { body: 1 } }).hand(P1, CARD, "sett").build();
    await game.p1.play("sett");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("sett")).toBe("base");
    expect(game.state("sett")).toMatchObject({ baseMight: 4, isExhausted: true });
    expect((await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "s").build()).p1.can("play", "s")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4, power: { body: 1 } }).hand(P1, CARD, "s").build()).p1.can("play", "s")).toBe(false);
  });

  test("'When you play me, buff me' — a freshly played Sett should end up buffed at 5 Might", async () => {
    // Expected: play trigger → one buff counter (+1). Actual: no trigger exists, stays 4 / unbuffed.
    const game = await scenario().resources(P1, { energy: 5, power: { body: 1 } }).hand(P1, CARD, "sett").build();
    await game.p1.play("sett");
    await game.settle();
    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.state("sett").might).toBe(5);
  });

  test("'When I conquer, buff me' — an unbuffed Sett walking onto an empty enemy battlefield conquers and gets buffed", async () => {
    // Expected: conquer (1 point) then the conquer trigger buffs him → 5. Actual: conquers, no buff.
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "sett").build();
    await game.p1.move("sett", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
  });

  test("conquering while already buffed adds no second counter (702.3): still exactly 5 Might", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "sett", { buffed: true }).build();
    await game.p1.move("sett", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
    expect(game.violations()).toEqual([]);
  });

  test("Spend my buff: the buff is removed on ACTIVATION (cost), the ability sits on the chain at 4 Might, resolves to 8, costs no resources, and wears off next turn", async () => {
    const game = await scenario().unit(P1, "base", CARD, "sett", { buffed: true }).build();
    expect(game.state("sett").might).toBe(5);
    await game.p1.activate("sett");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sett", controller: P1, triggered: false })]);
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 4 });
    await game.settle();
    expect(game.state("sett").might).toBe(8);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.can("activate", "sett")).toBe(false); // one pump per buff
    await game.advanceTurn();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 4 });
  });

  test("no buff → the cost is unpayable and the ability is not offered (702.2.b.1)", async () => {
    const game = await scenario().resources(P1, { energy: 9, power: { body: 3 } }).unit(P1, "base", CARD, "sett").build();
    expect(game.p1.legal().some((o) => o.card === "sett")).toBe(false);
    const t = await game.p1.try((p) => p.activate("sett", 0));
    expect(t.ok).toBe(false);
    expect(game.state("sett").might).toBe(4);
  });

  test("the opponent may respond to the pump (377.3.b.2): a 4-damage Reaction in that window kills the now-4-Might Sett; the pump then fizzles", async () => {
    const game = await scenario().unit(P1, "base", CARD, "sett", { buffed: true }).hand(P2, SNIPE, "snipe").build();
    await game.p1.activate("sett");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("snipe", { targets: "sett" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sett", "snipe"]);
    await game.settle();
    expect(game.zoneOf("sett")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p1.units()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("once the pump has resolved the same Snipe only wounds him (8 Might, 4 damage); next turn (+4 gone, damage healed) it is lethal", async () => {
    const slow = { abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }], cardType: "spell", domain: "body", energyCost: 0, name: "Slow Draw", timing: "action" };
    const game = await scenario().unit(P1, "base", CARD, "sett", { buffed: true }).hand(P1, slow, "slow").hand(P2, SNIPE, "snipe").hand(P2, SNIPE, "snipe2").build();
    await game.p1.activate("sett");
    await game.settle();
    expect(game.state("sett").might).toBe(8);
    await game.p1.cast("slow"); // opens a chain so P2 gets a Reaction window this turn
    await game.p1.passPriority();
    await game.p2.cast("snipe", { targets: "sett" });
    await game.settle();
    expect(game.zoneOf("sett")).toBe("base");
    expect(game.state("sett")).toMatchObject({ damage: 4, might: 8 });
    await game.advanceTurn();
    expect(game.state("sett")).toMatchObject({ damage: 0, might: 4 });
    await game.p2.cast("snipe2", { targets: "sett" });
    await game.settle();
    expect(game.zoneOf("sett")).toBe("trash");
  });

  test("timing (381): not activatable on the opponent's turn, nor by the opponent (702.2.b.2)", async () => {
    const game = await scenario().active(P2).unit(P1, "base", CARD, "sett", { buffed: true }).build();
    expect(game.p1.can("activate", "sett")).toBe(false);
    expect(game.p2.can("activate", "sett")).toBe(false);
    expect((await game.p1.try((p) => p.activate("sett", 0))).ok).toBe(false);
    expect(game.state("sett").isBuffed).toBe(true);
  });

  test("timing (343.1.b): not activatable during a showdown even while P1 holds Focus — the pump must come before the attack", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "sett", { buffed: true })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
      .build();
    await game.p1.move("scout", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "sett")).toBe(false);
  });

  test("timing (331.1.b): not activatable while a chain is open (P1 holding priority over its own spell)", async () => {
    const slow = { abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }], cardType: "spell", domain: "body", energyCost: 0, name: "Slow Draw", timing: "action" };
    const game = await scenario().unit(P1, "base", CARD, "sett", { buffed: true }).hand(P1, slow, "slow").build();
    await game.p1.cast("slow");
    expect(game.chain()).toHaveLength(1);
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "sett")).toBe(false);
  });

  test("full line: pump in base (8), attack a 7-Might defender, kill it, survive, conquer for a point", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "sett", { buffed: true })
      .unit(P2, "bf1", { might: 7, name: "Bruiser" }, "bruiser")
      .build();
    await game.p1.activate("sett");
    await game.settle();
    expect(game.state("sett").might).toBe(8);
    await game.p1.move("sett", "bf1");
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.zoneOf("sett")).toBe("battlefield-bf1");
    expect(game.state("sett").damage).toBe(0); // healed in combat cleanup (143.3.b.2)
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    // 4 printed + 4 from the pump (still this turn) + 1 from the buff the
    // conquer trigger just placed (rule 383.4.c / 702.3).
    expect(game.state("sett").might).toBe(9);
  });

  test("…and that conquer re-buffs him (9 Might for the rest of the turn, 5 next turn)", async () => {
    // Expected: conquer trigger places a fresh buff after the pump spent the old one. Actual: no trigger.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "sett", { buffed: true })
      .unit(P2, "bf1", { might: 7, name: "Bruiser" }, "bruiser")
      .build();
    await game.p1.activate("sett");
    await game.settle();
    await game.p1.move("sett", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 9 });
    await game.advanceTurn();
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
  });
});
