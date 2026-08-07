/**
 * Tianna Crownguard — sfd-060-221 · Unit · Calm · 7 energy + [calm][calm] · 4 might
 *
 *   [Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *   While I'm at a battlefield, opponents can't gain points.
 *
 * Head-judge notes (trickiest situations for this card):
 *  - The lock is a conditional static: only while Tianna is AT A BATTLEFIELD (any battlefield, not
 *    just the one being scored). In base, in hand, or dead → opponents score normally.
 *  - "can't gain points" removes the POINT, not the score event: the opponent still conquers /
 *    holds (control changes, "When I hold" still triggers) — they just get 0. It also stops points
 *    from card effects (Ahri, Alluring: "When I hold, you score 1 point") — 054.1 can't beats can.
 *  - It never restricts Tianna's controller: P1 still scores their own hold with her on the field.
 *  - Ordering inside one combat: if the attacker kills Tianna in the damage step, she is in the trash
 *    by the resolution step, so the conquer that follows DOES award its point.
 *  - Denies even the game-winning point (opponent on 7 of 8 holding → stays on 7, game continues).
 *  - Deflect 1: opponents' spells/abilities that choose her cost 1 extra power of ANY domain
 *    (809.1.c.1); her controller's own spells pay nothing extra (721.1.c "opponents").
 *  - Cost: 7 energy + two calm power.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-060-221";
const AHRI_ALLURING = "ogn-066-298"; // Calm unit: "When I hold, you score 1 point."
const BOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  rulesText: "Deal 1 to a unit.",
  timing: "action",
};

/** Two battlefields; Tianna for P1 at `where`; P2 has a 2-might Raider in base and a Holder on bf2 (P2-controlled). */
function board(where: "bf1" | "base") {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: null })
    .unit(P1, where, CARD, "tianna")
    .unit(P2, "bf2", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider");
}

describe("Tianna Crownguard (sfd-060-221)", () => {
  test("parsed abilities: Deflect 1 keyword + a static 'opponents can't gain points' gated on while-at-battlefield", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 7, might: 4, powerCost: ["calm", "calm"] });
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({ keyword: "Deflect", type: "keyword", value: 1 });
    expect(def?.abilities?.[1]).toMatchObject({
      condition: { type: "while-at-battlefield" },
      effect: { type: "restriction" },
      type: "static",
    });
    expect(String((def?.abilities?.[1] as { effect?: { restriction?: string } }).effect?.restriction)).toMatch(/opponents can'?t gain points/i);
  });

  test("cost: 7 energy + 2 calm; enters base exhausted with 4 might and Deflect; one calm short or 6 energy → not legal", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { calm: 2 } }).hand(P1, CARD, "tianna").build();
    await game.p1.play("tianna");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("tianna")).toBe("base");
    expect(game.state("tianna")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.state("tianna").keywords).toContain("Deflect");
    expect((await scenario().resources(P1, { energy: 7, power: { calm: 1 } }).hand(P1, CARD, "tianna").build()).p1.can("play", "tianna")).toBe(false);
    expect((await scenario().resources(P1, { energy: 6, power: { calm: 2 } }).hand(P1, CARD, "tianna").build()).p1.can("play", "tianna")).toBe(false);
  });

  test("Deflect: an opponent's spell choosing her needs 1 extra power (any domain); another target needs none; her own controller pays nothing extra", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", CARD, "tianna")
      .unit(P1, "base", { might: 2, name: "Other" }, "other")
      .hand(P2, BOLT, "bolt")
      .build();
    expect(game.p2.can("cast", "bolt")).toBe(true); // "other" is affordable
    expect((await game.p2.try((p) => p.cast("bolt", { targets: "tianna" }))).ok).toBe(false);
    await game.p2.do("addResources", { power: { fury: 1 } }); // any domain pays Deflect (809.1.c.1)
    await game.p2.cast("bolt", { targets: "tianna" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("tianna").damage).toBe(1);
    // Her controller's own spell: no surcharge.
    const mine = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "tianna").hand(P1, BOLT, "bolt").build();
    await mine.p1.cast("bolt", { targets: "tianna" });
    expect(mine.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test.failing("BUG: while she is at a battlefield the opponent's CONQUER elsewhere still takes the battlefield but awards no point", async () => {
    // Expected: bf3 → P2, P2 points stay 0. Actual: the conditional static fails open and P2 scores 1.
    const game = await board("bf1").active(P2).build();
    await game.p2.move("raider", "bf3");
    await game.settle();
    expect(game.gameState.battlefields.bf3?.controller).toBe(P2);
    expect(game.locationOf("raider")).toBe("bf3");
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0);
  });

  test.failing("BUG: while she is at a battlefield the opponent's HOLD at the start of their turn awards no point", async () => {
    const game = await board("bf1").active(P1).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2); // still theirs — only the point is denied
    expect(game.p2.points()).toBe(0);
  });

  test("negative space: with Tianna in BASE the opponent conquers and holds for points as usual", async () => {
    const conquer = await board("base").active(P2).build();
    await conquer.p2.move("raider", "bf3");
    await conquer.settle();
    expect(conquer.p2.points()).toBe(1);
    const hold = await board("base").active(P1).build();
    await hold.advanceTurn();
    expect(hold.p2.points()).toBe(1);
  });

  test("only OPPONENTS are locked: her controller still scores the hold at her battlefield (and P2, next, gets nothing)", async () => {
    const game = await board("bf1").active(P2).build();
    await game.advanceTurn(); // → P1's turn: P1 holds bf1 with Tianna on it
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test.failing("BUG: points from card effects are denied too — an enemy Ahri holding scores neither the hold point nor her 'score 1 point' trigger", async () => {
    // Baseline (Tianna in base): Ahri's hold is worth 2 (hold + trigger). With Tianna at bf1: 0.
    const base = await scenario().active(P1).battlefield("bf1", { controller: P1 }).battlefield("bf2", { controller: P2 }).unit(P1, "base", CARD, "tianna").unit(P2, "bf2", AHRI_ALLURING, "ahri").build();
    await base.advanceTurn({ policy: "first" });
    expect(base.p2.points()).toBe(2);
    const locked = await scenario().active(P1).battlefield("bf1", { controller: P1 }).battlefield("bf2", { controller: P2 }).unit(P1, "bf1", CARD, "tianna").unit(P2, "bf2", AHRI_ALLURING, "ahri").build();
    await locked.advanceTurn({ policy: "first" });
    expect(locked.turnPlayer()).toBe(P2);
    expect(locked.p2.points()).toBe(0);
  });

  test.failing("BUG: denies even the winning point — opponent on 7/8 holding while she is at a battlefield stays on 7 and the game goes on", async () => {
    const game = await board("bf1").active(P1).victoryScore(8).points(P2, 7).build();
    await game.p1.endTurn();
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.p2.points()).toBe(7);
    expect(game.turnPlayer()).toBe(P2);
  });

  test("ordering inside one combat: a 6-might attacker kills Tianna in the damage step, so the conquer that follows is worth its point", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "tianna")
      .unit(P2, "base", { might: 6, name: "Brute" }, "brute")
      .build();
    await game.p2.move("brute", "bf1");
    await game.settle();
    expect(game.zoneOf("tianna")).toBe("trash");
    expect(game.state("brute").damage).toBe(0); // 4 taken, healed in the combat cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test.failing("BUG: the lock is live, not retroactive — conquer while she's out (0), kill her through Deflect, conquer again the same turn (1)", async () => {
    const BIG_BOLT = { ...BOLT, abilities: [{ ...BOLT.abilities[0], effect: { ...BOLT.abilities[0].effect, amount: 4 } }], energyCost: 2, name: "Big Bolt" };
    const game = await board("bf1")
      .active(P2)
      .resources(P2, { energy: 2, power: { fury: 1 } })
      .battlefield("bf4", { controller: null })
      .unit(P2, "base", { might: 2, name: "Second" }, "second")
      .hand(P2, BIG_BOLT, "bigBolt")
      .build();
    await game.p2.move("raider", "bf3");
    await game.settle();
    expect(game.gameState.battlefields.bf3?.controller).toBe(P2);
    expect(game.p2.points()).toBe(0); // denied — she is at bf1
    await game.p2.cast("bigBolt", { targets: "tianna" }); // 2 energy + 1 power for Deflect
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("tianna")).toBe("trash");
    await game.p2.move("second", "bf4");
    await game.settle();
    expect(game.gameState.battlefields.bf4?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1); // no longer denied; the earlier denied point is not refunded
  });
});
