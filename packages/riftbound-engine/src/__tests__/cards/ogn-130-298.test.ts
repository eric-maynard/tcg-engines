/**
 * Crackshot Corsair — ogn-130-298 · Unit · Body · 3 energy · 3 might
 *
 *   When I attack, deal 1 to an enemy unit here.
 *
 * "When I attack" triggers when this unit becomes an attacker (a showdown opens at a
 * battlefield it moved to that is held/occupied by an opponent). "here" = the battlefield
 * where it is attacking (rule 359.3.f.2).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CORSAIR = "ogn-130-298";

describe("Crackshot Corsair (ogn-130-298)", () => {
  test("costs 3 energy to play (3 Might); not playable with 2", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CORSAIR, "cc").build();
    await game.p1.play("cc", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("cc")).toBe("base");
    expect(game.state("cc").might).toBe(3);
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, CORSAIR, "cc").build();
    expect(poor.p1.can("play", "cc")).toBe(false);
  });

  test("When I attack: the trigger goes on the chain and deals 1 to the enemy unit here", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CORSAIR, "cc")
      .unit(P2, "bf1", { might: 5 }, "foe")
      .build();
    await game.p1.move("cc", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cc", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("foe");
    }
    // Trigger resolved before combat damage: foe has exactly 1 damage, still on the battlefield.
    expect(game.state("foe").damage).toBe(1);
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
  });

  test("only ENEMY units HERE are legal choices (not friendly units, not units elsewhere)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", CORSAIR, "cc")
      .unit(P1, "bf1", { might: 2 }, "friend")
      .unit(P2, "bf1", { might: 4 }, "a")
      .unit(P2, "bf1", { might: 4 }, "b")
      .unit(P2, "bf2", { might: 1 }, "elsewhere")
      .unit(P2, "base", { might: 1 }, "home")
      .build();
    await game.p1.move("cc", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect(new Set(offered)).toEqual(new Set(["a", "b"]));
    await game.p1.pick("b");
    expect(game.state("b").damage).toBe(1);
    expect(game.state("a").damage).toBe(0);
  });

  test.failing("BUG: killing the lone 1-Might defender with the trigger should leave Corsair at bf1 and conquer it (rules 465.1, 466.3.a, 466.5)", async () => {
    // Expected: with no defenders left, combat damage is skipped, the attacker stays and
    // establishes control (conquer). Actual: resolveFullCombat recalls Corsair to base and
    // bf1 remains controlled by P2.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CORSAIR, "cc")
      .unit(P2, "bf1", { might: 1 }, "weak")
      .build();
    await game.p1.move("cc", "bf1");
    await game.settle();
    expect(game.zoneOf("weak")).toBe("trash");
    expect(game.locationOf("cc")).toBe("bf1");
    expect(game.state("cc").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("does not trigger when defending", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CORSAIR, "cc")
      .unit(P2, "base", { might: 2 }, "attacker")
      .build();
    await game.p2.move("attacker", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.state("attacker").damage).toBe(0);
  });
});
