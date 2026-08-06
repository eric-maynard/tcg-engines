/**
 * First Mate — ogn-132-298 · Unit · Body · 3 energy · 3 Might
 *
 *   When you play me, ready another unit.
 *
 * Rules: 143.4 (units enter exhausted), "when you play me" is a triggered ability that goes on
 * the chain after the unit enters; "another" excludes First Mate itself; "a unit" is any unit
 * (friendly or enemy) anywhere on the board.
 *
 * Units are exhausted through real moves (a standard move / being played) rather than placement
 * meta so the ready effect is observed through the engine's own flag store.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-132-298";

/** P1's turn: "ally" moves to the empty bf2 (→ exhausted), then First Mate is played. */
async function friendlyBoard() {
  const game = await scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .hand(P1, CARD, "fm")
    .build();
  await game.p1.move("ally", "bf2");
  await game.settle();
  expect(game.state("ally").isExhausted).toBe(true);
  return game;
}

describe("First Mate (ogn-132-298)", () => {
  test("cost: 3 energy, no power; 3 Might; enters exhausted; unaffordable with 2", async () => {
    const game = await friendlyBoard();
    await game.p1.play("fm", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("fm")).toBe("base");
    expect(game.state("fm").might).toBe(3);
    expect(game.state("fm").isExhausted).toBe(true);
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "fm").build();
    expect(poor.p1.can("play", "fm")).toBe(false);
  });

  test("when played, the trigger goes on the chain and readies the chosen other friendly unit", async () => {
    const game = await friendlyBoard();
    await game.p1.play("fm", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fm", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "fm" } });
    await game.p1.pick("ally");
    await game.settle();
    expect(game.state("ally").isReady).toBe(true);
    expect(game.locationOf("ally")).toBe("bf2"); // readied in place, not recalled
    expect(game.state("fm").isExhausted).toBe(true);
  });

  test("'a unit': an exhausted ENEMY unit is also a legal choice and gets readied", async () => {
    // P2 plays "foe" on their turn (enters exhausted), then P1's turn: Awaken only readies P1's cards.
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .hand(P2, { energyCost: 1, might: 2, name: "Foe" }, "foe")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, CARD, "fm")
      .build();
    await game.p2.play("foe");
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("foe").isExhausted).toBe(true);
    await game.p1.do("addResources", { energy: 3 });
    await game.p1.play("fm", { to: "base" });
    await game.settle();
    const d = game.decision();
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys).toEqual(expect.arrayContaining(["ally", "foe"]));
    await game.p1.pick("foe");
    await game.settle();
    expect(game.state("foe").isReady).toBe(true);
    expect(game.state("foe").controller).toBe(P2);
  });

  test("'another': First Mate itself is never offered; with no other unit nothing is readied", async () => {
    const game = await friendlyBoard();
    await game.p1.play("fm", { to: "base" });
    await game.settle();
    const d = game.decision();
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys).not.toContain("fm");
    expect(keys).toEqual(expect.arrayContaining(["ally", "foe"]));
    const alone = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "fm").build();
    await alone.p1.play("fm");
    await alone.settle();
    expect(alone.decision()?.kind).toBe("action");
    expect(alone.state("fm").isExhausted).toBe(true);
  });
});
