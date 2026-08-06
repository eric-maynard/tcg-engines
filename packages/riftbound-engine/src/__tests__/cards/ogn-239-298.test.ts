/**
 * Machine Evangel — ogn-239-298 · Unit · Order · 5 energy + [order] · 4 Might
 *
 *   [Deathknell] — Play three 1 [Might] Recruit unit tokens into your base. (When I die, get
 *   the effect.)
 *
 * Rules: 808 (Deathknell = "When I die, [Effect]"; triggers when killed and sent to the trash,
 * from any cause incl. combat — 323.4), 187.1 (Recruit token: 1-Might unit token), 143.4
 * (units enter exhausted), "into your base" regardless of where the Evangel died.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-239-298";
/** Inline vanilla 6-damage spell used to kill the Evangel outside combat. */
const BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Bolt 6",
  timing: "action",
};

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;
const recruitsAt = (game: Game, loc: string) =>
  game.p1.units(loc).filter((u) => game.state(u).isToken && game.state(u).name === "Recruit");

describe("Machine Evangel (ogn-239-298)", () => {
  test("costs 5 energy + 1 order; a 4-Might unit with Deathknell; unaffordable short of either", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { order: 1 } }).hand(P1, CARD, "me").build();
    await game.p1.play("me");
    await game.settle();
    expect(game.zoneOf("me")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("me").might).toBe(4);
    expect(game.state("me").keywords).toContain("Deathknell");
    expect(recruitsAt(game, "base")).toHaveLength(0); // nothing on play
    const noPower = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "me").build();
    expect(noPower.p1.can("play", "me")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 4, power: { order: 1 } }).hand(P1, CARD, "me").build();
    expect(lowEnergy.p1.can("play", "me")).toBe(false);
  });

  test("Deathknell on a spell death at a battlefield: trigger on the chain, then three exhausted 1-Might Recruit tokens in BASE", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "me")
      .hand(P1, BOLT, "bolt")
      .build();
    await game.p1.cast("bolt", { targets: "me" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Bolt resolves → lethal → Deathknell triggers
    expect(game.zoneOf("me")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "me", controller: P1, triggered: true })]);
    expect(recruitsAt(game, "base")).toHaveLength(0);
    await game.settle();
    const recruits = recruitsAt(game, "base");
    expect(recruits).toHaveLength(3);
    for (const r of recruits) {
      expect(game.state(r)).toMatchObject({ cardType: "unit", controller: P1, isExhausted: true, might: 1 });
    }
    expect(recruitsAt(game, "bf1")).toHaveLength(0);
    expect(game.p2.units()).toHaveLength(0);
  });

  test("Deathknell also triggers on a combat death (323.4 / 808.1.d): attacking into a 6-Might defender", async () => {
    // Expected: the Evangel takes lethal combat damage, dies → Deathknell → three Recruit tokens in
    // base. Actual: resolveFullCombat trashes the unit without ever creating the death trigger.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "me")
      .unit(P2, "bf1", { might: 6 }, "wall")
      .build();
    await game.p1.move("me", "bf1");
    await game.settle();
    expect(game.zoneOf("me")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.state("wall").damage).toBe(0); // 466.1.a.1: the combat cleanup heals all units
    expect(recruitsAt(game, "base")).toHaveLength(3);
    expect(recruitsAt(game, "bf1")).toHaveLength(0);
  });

  test("no trigger while it survives: 4 Might taking 3 damage stays on the board, no tokens", async () => {
    const bolt3 = { ...BOLT, abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], name: "Bolt 3" };
    const game = await scenario().unit(P1, "base", CARD, "me").hand(P1, bolt3, "bolt").build();
    await game.p1.cast("bolt", { targets: "me" });
    await game.settle();
    expect(game.zoneOf("me")).toBe("base");
    expect(game.state("me").damage).toBe(3);
    expect(game.chain()).toEqual([]);
    expect(recruitsAt(game, "base")).toHaveLength(0);
  });
});
