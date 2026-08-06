/**
 * Yi, Honed — ogs-009-024 · Champion Unit (Yi) · Body · 7 energy + [body] · 6 Might
 *
 *   [Ganking] (I can move from battlefield to battlefield.)
 *   I enter ready.
 *
 * Rules: 810 / 144.4.c.1 (Ganking: the Standard Move may go battlefield →
 * battlefield), 143.4 (units normally enter exhausted; "I enter ready" overrides).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogs-009-024";

describe("Yi, Honed (ogs-009-024)", () => {
  test("costs 7 energy + 1 body for a 6-Might unit with Ganking; unaffordable short of either", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { body: 1 } }).hand(P1, CARD, "yi").build();
    await game.p1.play("yi");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("yi")).toBe("base");
    expect(game.state("yi").might).toBe(6);
    expect(game.state("yi").keywords).toContain("Ganking");
    const noPower = await scenario().resources(P1, { energy: 7 }).hand(P1, CARD, "yi").build();
    expect(noPower.p1.can("play", "yi")).toBe(false);
    const low = await scenario().resources(P1, { energy: 6, power: { body: 1 } }).hand(P1, CARD, "yi").build();
    expect(low.p1.can("play", "yi")).toBe(false);
  });

  test("I enter ready: played from hand he arrives ready (a vanilla unit arrives exhausted)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { body: 1 } })
      .hand(P1, CARD, "yi")
      .hand(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Vanilla" }, "van")
      .build();
    await game.p1.play("yi");
    await game.settle();
    expect(game.state("yi").isReady).toBe(true);
    await game.p1.play("van");
    await game.settle();
    expect(game.state("van").isExhausted).toBe(true);
  });

  test("enter ready means he can move the turn he is played", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { body: 1 } })
      .battlefield("bf1", { controller: null })
      .hand(P1, CARD, "yi")
      .build();
    await game.p1.play("yi");
    await game.settle();
    await game.p1.move("yi", "bf1");
    await game.settle();
    expect(game.locationOf("yi")).toBe("bf1");
  });

  test("Ganking: moves battlefield → battlefield; a unit without Ganking there cannot", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", CARD, "yi")
      .unit(P1, "bf1", { might: 3 }, "grunt")
      .build();
    const t = await game.p1.try((p) => p.move("grunt", "bf2"));
    expect(t.ok).toBe(false);
    await game.p1.gank("yi", "bf2");
    await game.settle();
    expect(game.locationOf("yi")).toBe("bf2");
    expect(game.state("yi").isExhausted).toBe(true); // a Standard Move exhausts
    expect(game.locationOf("grunt")).toBe("bf1");
  });

  test("Ganking into an enemy-held battlefield opens combat there: 6 Might kills a 4-Might defender and conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "yi")
      .unit(P2, "bf2", { might: 4 }, "def")
      .build();
    await game.p1.gank("yi", "bf2");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.locationOf("yi")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });
});
