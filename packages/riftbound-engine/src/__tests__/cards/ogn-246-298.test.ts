/**
 * Viktor, Leader — ogn-246-298 · Champion Unit · Order · 4 energy + [order] · 4 might
 *
 *   When another non-Recruit unit you control dies, play a 1 [Might] Recruit unit token
 *   into your base.
 *
 * Rule 187.1: a Recruit token is a domainless 1-Might unit token with the Recruit tag.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const VIKTOR = "ogn-246-298";
const VENGEANCE = "ogn-229-298"; // 4 + [order][order]: "Kill a unit."
const recruits = (ids: string[]) => ids.filter((c) => c.startsWith("token-recruit-"));

function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { order: 4 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", VIKTOR, "vik")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .hand(P1, VENGEANCE, "v1")
    .hand(P1, VENGEANCE, "v2");
}

describe("Viktor, Leader (ogn-246-298)", () => {
  test("costs 4 energy + 1 order power; 4 Might", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { order: 1 } }).hand(P1, VIKTOR, "vik").build();
    await game.p1.play("vik", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("vik")).toBe("base");
    expect(game.state("vik").might).toBe(4);
    const noPower = await scenario().resources(P1, { energy: 4 }).hand(P1, VIKTOR, "vik").build();
    expect(noPower.p1.can("play", "vik")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 3, power: { order: 1 } }).hand(P1, VIKTOR, "vik").build();
    expect(lowEnergy.p1.can("play", "vik")).toBe(false);
  });

  test("another friendly unit dies (killed by a spell) → trigger on the chain → a 1-Might Recruit token in your base", async () => {
    const game = await board().build();
    await game.p1.cast("v1", { targets: "ally" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vik", controller: P1, triggered: true })]);
    await game.settle();
    const toks = recruits(game.p1.base());
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0]!)).toMatchObject({ controller: P1, isToken: true, might: 1, name: "Recruit" });
    expect(recruits(game.p1.units("bf1"))).toHaveLength(0); // into your base, nowhere else
  });

  test("non-Recruit only — a Recruit token dying creates nothing (rule 187.1: the token has the Recruit tag)", async () => {
    // Expected: killing the Recruit token leaves the base with no Recruits. Actual: its death
    // triggers Viktor again and a fresh Recruit token is created.
    const game = await board().build();
    await game.p1.cast("v1", { targets: "ally" });
    await game.settle();
    const [tok] = recruits(game.p1.base());
    expect(tok).toBeDefined();
    await game.p1.cast("v2", { targets: tok! });
    await game.settle();
    expect(game.has(tok!) ? game.zoneOf(tok!) : "gone").not.toBe("base");
    expect(recruits(game.p1.base())).toHaveLength(0);
  });

  test("'another': Viktor himself dying creates nothing", async () => {
    const game = await board().build();
    await game.p1.cast("v1", { targets: "vik" });
    await game.settle();
    expect(game.zoneOf("vik")).toBe("trash");
    expect(recruits(game.p1.base())).toHaveLength(0);
    expect(game.chain()).toEqual([]);
  });

  test("'you control': an enemy unit dying creates nothing for either player", async () => {
    const game = await board().build();
    await game.p1.cast("v1", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(recruits([...game.p1.base(), ...game.p2.base()])).toHaveLength(0);
  });

  test("a friendly unit dying IN COMBAT also triggers Viktor (any death counts)", async () => {
    // Expected: the 2-Might ally attacks a 3-Might defender, dies, and Viktor makes a Recruit in
    // base. Actual: combat deaths do not raise the "die" trigger, so no token appears.
    const game = await board().build();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(recruits(game.p1.base())).toHaveLength(1);
  });
});
