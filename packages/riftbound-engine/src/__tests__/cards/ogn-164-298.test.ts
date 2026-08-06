/**
 * Sett, Brawler — ogn-164-298 · Champion Unit (Sett) · Body · 5 energy + [body] · 4 Might
 *
 *   When I'm played and when I conquer, buff me. (If I don't have a buff, I get a +1 [Might] buff.)
 *   Spend my buff: Give me +4 [Might] this turn.
 *
 * Rules: 702.2.a / 702.3 (a buff is a +1 Might counter, max one per unit),
 * 702.2.b (spending a buff removes it — here it is the activation cost).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-164-298";

describe("Sett, Brawler (ogn-164-298)", () => {
  test("costs 5 energy + 1 body; unaffordable without the body power or with 4 energy", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { body: 1 } }).hand(P1, CARD, "sett").build();
    await game.p1.play("sett");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("sett")).toBe("base");
    expect(game.state("sett").isExhausted).toBe(true);
    const noPower = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "sett").build();
    expect(noPower.p1.can("play", "sett")).toBe(false);
    const low = await scenario().resources(P1, { energy: 4, power: { body: 1 } }).hand(P1, CARD, "sett").build();
    expect(low.p1.can("play", "sett")).toBe(false);
  });

  test("When I'm played: buff me → buffed, 4+1 = 5 Might", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { body: 1 } }).hand(P1, CARD, "sett").build();
    await game.p1.play("sett");
    await game.settle();
    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.state("sett").might).toBe(5);
  });

  test("When I conquer: an unbuffed Sett taking an empty enemy battlefield gets buffed", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "sett")
      .build();
    expect(game.state("sett").isBuffed).toBe(false);
    await game.p1.move("sett", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.state("sett").might).toBe(5);
  });

  test("conquering while already buffed adds no second buff (702.3): still 5 Might", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "sett", { buffed: true })
      .build();
    await game.p1.move("sett", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.state("sett").might).toBe(5);
  });

  test("Spend my buff: removes the buff and gives +4 Might this turn (4 base → 8), back to 4 next turn", async () => {
    const game = await scenario().unit(P1, "base", CARD, "sett", { buffed: true }).build();
    expect(game.state("sett").might).toBe(5);
    await game.p1.activate("sett", 1);
    expect(game.state("sett").isBuffed).toBe(false); // cost paid on activation
    await game.settle();
    expect(game.state("sett").might).toBe(8);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // no energy/power in the cost
    await game.advanceTurn();
    expect(game.state("sett").might).toBe(4);
    expect(game.state("sett").isBuffed).toBe(false);
  });

  test("Spend my buff is not available without a buff (702.2.b.1)", async () => {
    const game = await scenario().unit(P1, "base", CARD, "sett").build();
    const t = await game.p1.try((p) => p.activate("sett", 1));
    expect(t.ok).toBe(false);
    expect(game.state("sett").might).toBe(4);
  });
});
