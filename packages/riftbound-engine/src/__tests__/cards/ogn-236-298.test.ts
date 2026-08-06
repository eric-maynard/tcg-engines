/**
 * Karthus, Eternal — ogn-236-298 · Champion Unit (Karthus) · Order · 3 energy + [order] · 3 Might
 *
 *   Your [Deathknell] effects trigger an additional time.
 *
 * Rules: 808 (Deathknell: "When I die, [Effect]" triggered ability), 428.1.a.1.b (the dies-trigger
 * is put on the chain before the unit reaches the trash). Karthus's static makes each friendly
 * Deathknell trigger twice; opponents' Deathknells are unaffected.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-236-298";
const SENTRY = "ogn-096-298"; // Watchful Sentry, 1 Might: [Deathknell] — Draw 1.
const INCINERATE = "ogs-003-024"; // deal 2 to a unit at a battlefield

/** P1's turn with 2 energy and Incinerate in hand; a Sentry (owner configurable) sits at bf1. */
function board(opts: { karthus: boolean; sentryOwner?: typeof P1 }) {
  const b = scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: opts.sentryOwner ?? P1 })
    .unit(opts.sentryOwner ?? P1, "bf1", SENTRY, "sentry")
    .hand(P1, INCINERATE, "burn");
  return opts.karthus ? b.unit(P1, "base", CARD, "karthus") : b;
}

describe("Karthus, Eternal (ogn-236-298)", () => {
  test("cost: 3 energy + 1 order deducted; 3 Might; unaffordable without the order or with 2 energy", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { order: 1 } }).hand(P1, CARD, "karthus").build();
    await game.p1.play("karthus");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("karthus")).toBe("base");
    expect(game.state("karthus").might).toBe(3);
    const noOrder = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "karthus").build();
    expect(noOrder.p1.can("play", "karthus")).toBe(false);
    const low = await scenario().resources(P1, { energy: 2, power: { order: 1 } }).hand(P1, CARD, "karthus").build();
    expect(low.p1.can("play", "karthus")).toBe(false);
  });

  test("control: without Karthus a friendly Sentry's Deathknell draws exactly 1", async () => {
    const game = await board({ karthus: false }).build();
    await game.p1.cast("burn", { targets: "sentry" });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1); // burn left the hand, Deathknell drew 1
  });

  test.failing("BUG: with Karthus on board your Deathknell triggers an additional time — the Sentry draws 2", async () => {
    // Expected: Sentry dies → its Deathknell fires twice → P1 ends with 2 cards in hand.
    // Actual: the "trigger-double" static is not applied by the trigger runner; only 1 card is drawn.
    const game = await board({ karthus: true }).build();
    await game.p1.cast("burn", { targets: "sentry" });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("'Your': an ENEMY Sentry dying while you control Karthus draws its controller only 1", async () => {
    const game = await board({ karthus: true, sentryOwner: P2 }).build();
    const p2Before = game.p2.hand().length;
    await game.p1.cast("burn", { targets: "sentry" });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p2.hand().length).toBe(p2Before + 1);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("Karthus himself has no Deathknell: his own death draws nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "karthus")
      .hand(P1, "ogs-022-024", "spark") // Final Spark: deal 8 to a unit
      .build();
    expect(game.state("karthus").keywords).not.toContain("Deathknell");
    await game.p1.cast("spark", { targets: "karthus" });
    await game.settle();
    expect(game.zoneOf("karthus")).not.toBe("battlefield-bf1");
    expect(game.p1.hand()).toHaveLength(0);
  });
});
