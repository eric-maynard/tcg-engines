/**
 * Highlander — ogs-020-024 · Spell · Calm/Body · 4 energy · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Choose a friendly unit. The next time it would die this turn, heal it, exhaust it, and
 *   recall it instead. (Send it to base. This isn't a move.)
 *
 * Rules: 813 (Reaction: also playable in Closed States / showdowns on any player's turn),
 * 355 (a chosen friendly unit is a target — no friendly unit → not playable), 370–375
 * (replacement effect: the death event is replaced by heal + exhaust + recall; applies once —
 * "the next time" — and only "this turn"), 454 (recall → base, not a Move).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogs-020-024";
/** Inline vanilla 6-damage Action spell used as the lethal event. */
const BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Bolt 6",
  timing: "action",
};

function board(energy = 4) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Ally" }, "ally")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
    .hand(P1, CARD, "hl")
    .hand(P1, BOLT, "bolt")
    .hand(P1, BOLT, "bolt2");
}

describe("Highlander (ogs-020-024)", () => {
  test("cost: castable with 4 energy (no power), not with 3", async () => {
    expect((await board(4).build()).p1.can("cast", "hl")).toBe(true);
    expect((await board(3).build()).p1.can("cast", "hl")).toBe(false);
  });

  test("[Reaction] timing: castable while an opponent's spell is on the chain during THEIR turn, and inside a showdown", async () => {
    const game = await board().active(P2).hand(P2, BOLT, "theirBolt").build();
    await game.p2.cast("theirBolt", { targets: "ally" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "hl")).toBe(true);
    const sd = await board().active(P2).unit(P2, "base", { might: 5 }, "atk").build();
    await sd.p2.move("atk", "bf1");
    await sd.p2.passFocus();
    expect(sd.p1.can("cast", "hl")).toBe(true);
  });

  test("must choose a FRIENDLY unit when played (enemy units not offered; no friendly unit → not playable); costs 4", async () => {
    // Expected: a required `targets` choice listing only ally; with no friendly unit on the board the
    // spell is not castable. Actual: Highlander is offered with no target at all and always castable.
    const game = await board().build();
    const targets = game.p1.option("cast", "hl")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["ally"]]);
    await game.p1.cast("hl", { targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    const lonely = await scenario().resources(P1, { energy: 4 }).unit(P2, "base", { might: 3 }, "foe").hand(P1, CARD, "hl").build();
    expect(lonely.p1.can("cast", "hl")).toBe(false);
  });

  test("the next time the chosen unit would die this turn it is instead healed, exhausted and recalled to base — once only", async () => {
    // Expected: after Highlander resolves on ally (3 Might at bf1), a 6-damage spell does not kill it:
    // ally ends in base, exhausted, damage 0, Highlander in trash. A SECOND lethal hit the same turn
    // then kills it ("the next time" = one replacement). Actual: no replacement is set up; ally dies.
    const game = await board().build();
    await game.p1.cast("hl", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("hl")).toBe("trash");
    await game.p1.cast("bolt", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p1.trash()).not.toContain("ally");
    await game.p1.cast("bolt2", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
  });

  test("a combat death is replaced too — the attacker comes home exhausted and unhurt instead of dying", async () => {
    // Expected: ally (3) attacks a 5-Might defender, would die → healed/exhausted/recalled to base;
    // the defender keeps bf1. Actual: ally goes to the trash.
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .hand(P1, CARD, "hl")
      .build();
    await game.p1.cast("hl", { targets: "ally" });
    await game.settle();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("'this turn': on a later turn the protection is gone and lethal damage kills the unit", async () => {
    const game = await board().active(P1).hand(P2, BOLT, "theirBolt").build();
    await game.p1.cast("hl", { targets: game.p1.option("cast", "hl")?.fields.length ? "ally" : undefined });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.cast("theirBolt", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
  });
});
