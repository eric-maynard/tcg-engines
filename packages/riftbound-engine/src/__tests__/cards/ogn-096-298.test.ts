/**
 * Watchful Sentry — ogn-096-298 · Unit · Mind · 2 energy · 1 might
 *
 *   [Deathknell] — Draw 1. (When I die, get the effect.)
 *
 * Rules: 808 Deathknell (triggered ability keyword: "When I die, [Effect]"),
 * 428.1.a.1.b (a killed unit's dies-trigger goes on the chain before it hits
 * the trash), 323.4 (combat deaths trigger Deathknell too).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const SENTRY = "ogn-096-298";
const FINAL_SPARK = "ogs-022-024"; // 8 energy: Deal 8 to a unit.

describe("Watchful Sentry (ogn-096-298)", () => {
  test("cost: 2 energy, no power; a 1-might unit with the Deathknell keyword; unaffordable with 1", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, SENTRY, "sentry").build();
    await game.p1.play("sentry", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("base");
    expect(game.state("sentry").might).toBe(1);
    expect(game.state("sentry").keywords).toContain("Deathknell");
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, SENTRY, "sentry").build();
    expect(poor.p1.can("play", "sentry")).toBe(false);
  });

  test("dies to spell damage → Deathknell goes on the chain as its controller's trigger, then they draw 1", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 8 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SENTRY, "sentry")
      .hand(P2, FINAL_SPARK, "spark")
      .build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("spark", { targets: "sentry" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Final Spark resolves: 8 damage kills the Sentry
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sentry", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.p1.hand().length).toBe(p1Hand + 1);
    expect(game.p2.hand().length).toBe(p2Hand - 1); // the killer draws nothing
  });

  test("dying in combat also triggers Deathknell — the Sentry's controller draws 1 (rule 323.4)", async () => {
    // A 3-might attacker kills the defending Sentry; its Deathknell fires and P1 draws 1.
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SENTRY, "sentry")
      .unit(P2, "base", { might: 3 }, "atk")
      .build();
    const p1Hand = game.p1.hand().length;
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand().length).toBe(p1Hand + 1);
  });

  test("no trigger while it lives: surviving damage draws nothing", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SENTRY, "sentry")
      .unit(P1, "bf1", { keywords: ["Tank"], might: 5 }, "wall")
      .unit(P2, "base", { might: 1 }, "atk")
      .build();
    const p1Hand = game.p1.hand().length;
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.locationOf("sentry")).toBe("bf1");
    expect(game.p1.hand().length).toBe(p1Hand);
  });
});
