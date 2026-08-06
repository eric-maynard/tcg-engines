/**
 * Stormclaw Ursine — ogn-137-298 · Unit · Body · 7 energy · 6 Might
 *
 *   [Tank] (I must be assigned combat damage first.)
 *   When you play me, channel 1 rune exhausted.
 *
 * Rules: 815 (Tank: lethal combat damage must be assigned to Tank units first),
 * 430.2 (channel N exhausted: top rune of the rune deck enters the board exhausted),
 * 143.4 (units enter exhausted).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-137-298";

describe("Stormclaw Ursine (ogn-137-298)", () => {
  test("costs 7 energy (no power); a 6-Might Tank unit; unaffordable at 6 energy", async () => {
    const game = await scenario().resources(P1, { energy: 7 }).hand(P1, CARD, "bear").build();
    expect(game.p1.can("play", "bear")).toBe(true);
    await game.p1.play("bear");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("bear")).toBe("base");
    expect(game.state("bear").might).toBe(6);
    expect(game.state("bear").keywords).toContain("Tank");
    expect(game.state("bear").isExhausted).toBe(true);
    const poor = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "bear").build();
    expect(poor.p1.can("play", "bear")).toBe(false);
  });

  test("When you play me: channel 1 rune, and it enters exhausted (rune deck shrinks by 1)", async () => {
    const game = await scenario().resources(P1, { energy: 7 }).hand(P1, CARD, "bear").build();
    const runes0 = game.p1.runes().length;
    const deck0 = game.p1.runeDeck().length;
    expect(runes0).toBe(0);
    await game.p1.play("bear");
    await game.settle();
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runeDeck()).toHaveLength(deck0 - 1);
    const [rune] = game.p1.runes();
    expect(game.state(rune as string).isExhausted).toBe(true);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    // An exhausted rune cannot be tapped for energy this turn.
    expect(game.p1.can("tapRune", rune)).toBe(false);
    expect(game.p2.runes()).toHaveLength(0);
  });

  test("the channel trigger fires only when PLAYED — a Ursine already on the board channels nothing across turns beyond the normal 2", async () => {
    const game = await scenario().turn(2).active(P2).unit(P1, "base", CARD, "bear").build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(2); // just the Channel phase
  });

  test("[Tank]: as a defender beside a weaker ally, all combat damage must go to the Ursine first", async () => {
    // Control: without a Tank, a 3-Might attacker kills the 2-Might defender.
    const control = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "small")
      .unit(P2, "bf1", { might: 6 }, "big")
      .unit(P1, "base", { might: 3 }, "atk")
      .build();
    await control.p1.move("atk", "bf1");
    await control.settle();
    expect(control.zoneOf("small")).toBe("trash");

    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "small")
      .unit(P2, "bf1", CARD, "bear")
      .unit(P1, "base", { might: 3 }, "atk")
      .build();
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("small")).toBe("battlefield-bf1"); // 3 damage all lands on the 6-Might Tank
    expect(game.zoneOf("bear")).toBe("battlefield-bf1");
    expect(game.state("bear").damage).toBe(0); // healed in combat cleanup
    expect(game.zoneOf("atk")).toBe("trash"); // took 6 + 2
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
