/**
 * Soaring Scout — ogn-216-298 · Unit · Order · 2 energy · 1 might
 *
 *   [Deathknell] — Channel 1 rune exhausted. (When I die, get the effect.)
 *
 * Rules: 808 Deathknell ("When I die, [Effect]"), 428.1.a.1.b (the dies-trigger is added to the
 * chain before the unit reaches the trash), 323.4 (combat deaths trigger it too). Channel = top rune
 * of the rune deck → rune pool; "exhausted" means it arrives tapped and yields no energy now.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const SCOUT = "ogn-216-298";
const FINAL_SPARK = "ogs-022-024"; // 8 energy: Deal 8 to a unit.

function killedBySpell() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 8 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SCOUT, "scout")
    .hand(P2, FINAL_SPARK, "spark");
}

describe("Soaring Scout (ogn-216-298)", () => {
  test("cost: 2 energy, no power; a 1-might unit with Deathknell; unaffordable with 1", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, SCOUT, "scout").build();
    await game.p1.play("scout");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.state("scout").might).toBe(1);
    expect(game.state("scout").keywords).toContain("Deathknell");
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, SCOUT, "scout").build();
    expect(poor.p1.can("play", "scout")).toBe(false);
  });

  test("dies to spell damage → its Deathknell goes on the chain as its controller's triggered ability", async () => {
    const game = await killedBySpell().build();
    await game.p2.cast("spark", { targets: "scout" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Final Spark resolves: 8 damage kills the Scout
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "scout", controller: P1, triggered: true })]);
  });

  test("Deathknell effect: the Scout's controller channels 1 rune, and it enters the pool EXHAUSTED (no energy)", async () => {
    const game = await killedBySpell().build();
    const pool0 = game.p1.runes().length;
    const deck0 = game.p1.runeDeck().length;
    const p2Pool0 = game.p2.runes().length;
    const energy0 = game.p1.energy();
    await game.p2.cast("spark", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(pool0 + 1);
    expect(game.p1.runeDeck()).toHaveLength(deck0 - 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(pool0);
    expect(game.p1.energy()).toBe(energy0);
    expect(game.p2.runes()).toHaveLength(p2Pool0); // the killer channels nothing
  });

  test.failing("BUG: dying in combat also triggers Deathknell — the controller channels 1 exhausted rune (rule 323.4)", async () => {
    // Expected: a 3-might attacker kills the defending Scout; P1's rune pool grows by one exhausted rune.
    // Actual: combat deaths do not fire the die trigger, so nothing is channeled.
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SCOUT, "scout")
      .unit(P2, "base", { might: 3 }, "atk")
      .build();
    const pool0 = game.p1.runes().length;
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(pool0 + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
  });

  test("no trigger while it lives: surviving combat behind a Tank channels nothing", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SCOUT, "scout")
      .unit(P1, "bf1", { keywords: ["Tank"], might: 5 }, "wall")
      .unit(P2, "base", { might: 1 }, "atk")
      .build();
    const pool0 = game.p1.runes().length;
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.locationOf("scout")).toBe("bf1");
    expect(game.p1.runes()).toHaveLength(pool0);
  });
});
