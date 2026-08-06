/**
 * Eclipse Herald — ogn-059-298 · Unit · Calm · 7 energy + 1 [calm] · 7 Might
 *
 *   When you stun an enemy unit, ready me and give me +1 [Might] this turn.
 *
 * Rule 423.1.a.1: a stunned unit can't be stunned again — choosing an
 * already-stunned unit does NOT trigger Eclipse Herald (the rule's own example).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-059-298";
const RUNE_PRISON = "ogn-050-298"; // [Action] Stun a unit. (2 energy + 1 calm)
const EXHAUSTED = { __flags: { exhausted: true } } as const;

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { calm: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", CARD, "herald", EXHAUSTED)
    .unit(P1, "base", { might: 2 }, "ally")
    .unit(P2, "bf1", { might: 3 }, "foe")
    .unit(P2, "bf1", { might: 3 }, "dazed", { stunned: true })
    .hand(P1, RUNE_PRISON, "prison")
    .hand(P1, RUNE_PRISON, "prison2");
}

describe("Eclipse Herald (ogn-059-298)", () => {
  test("costs 7 energy + 1 calm; enters the base exhausted as a 7-Might unit", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { calm: 1 } }).hand(P1, CARD, "herald").build();
    await game.p1.play("herald");
    await game.settle();
    expect(game.zoneOf("herald")).toBe("base");
    expect(game.state("herald").might).toBe(7);
    expect(game.state("herald").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    const poor = await scenario().resources(P1, { energy: 7 }).hand(P1, CARD, "herald").build();
    expect(poor.p1.can("play", "herald")).toBe(false);
    const poor2 = await scenario().resources(P1, { energy: 6, power: { calm: 1 } }).hand(P1, CARD, "herald").build();
    expect(poor2.p1.can("play", "herald")).toBe(false);
  });

  test("stunning an enemy unit readies me and gives me +1 Might", async () => {
    const game = await board().build();
    await game.p1.cast("prison", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.state("herald").isReady).toBe(true);
    expect(game.state("herald").might).toBe(8);
  });

  test("the +1 Might lasts only this turn (the ready state persists)", async () => {
    const game = await board().build();
    await game.p1.cast("prison", { targets: "foe" });
    await game.settle();
    expect(game.state("herald").might).toBe(8);
    await game.advanceTurn();
    expect(game.state("herald").might).toBe(7);
  });

  test("stunning a FRIENDLY unit does not trigger", async () => {
    const game = await board().build();
    await game.p1.cast("prison", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").isStunned).toBe(true);
    expect(game.state("herald").isExhausted).toBe(true);
    expect(game.state("herald").might).toBe(7);
  });

  test.failing("BUG: choosing an already-stunned enemy unit does not stun it again, so the Herald must not trigger (rule 423.1.a.1)", async () => {
    // Expected: "dazed" is already stunned → no stun event → Herald stays exhausted at 7 Might.
    // Actual: the stun handler re-sets the flag and fires the stun trigger unconditionally.
    const game = await board().build();
    await game.p1.cast("prison", { targets: "dazed" });
    await game.settle();
    expect(game.state("dazed").isStunned).toBe(true);
    expect(game.state("herald").isExhausted).toBe(true);
    expect(game.state("herald").might).toBe(7);
  });

  test("'when YOU stun': an opponent stunning one of your units (enemy to them) does not trigger my Herald", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { calm: 1 } })
      .unit(P1, "base", CARD, "herald", EXHAUSTED)
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P2, RUNE_PRISON, "prison")
      .build();
    await game.p2.cast("prison", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").isStunned).toBe(true);
    expect(game.state("herald").isExhausted).toBe(true);
    expect(game.state("herald").might).toBe(7);
  });
});
