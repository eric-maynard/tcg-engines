/**
 * Pit Crew — ogn-091-298 · Unit · Mind · 3 energy · 3 Might
 *
 *   When you play a gear, ready me.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-091-298";
const WRENCH = { abilities: [], cardType: "gear", domain: "mind", energyCost: 1, name: "Test Wrench" };
const RECRUIT = { cardType: "unit", energyCost: 1, might: 1, name: "Test Recruit" };
const DISCIPLINE = "ogn-058-298"; // [Reaction] Give a unit +2 Might this turn. Draw 1. (2 energy)

function board(active = P1) {
  return scenario()
    .active(active)
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 3 })
    .unit(P1, "base", CARD, "crew", { exhausted: true })
    .hand(P1, WRENCH, "wrench")
    .hand(P2, WRENCH, "theirs");
}

describe("Pit Crew (ogn-091-298)", () => {
  test("costs 3 energy and enters the base exhausted as a 3-Might unit; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "crew").build();
    await game.p1.play("crew");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("crew")).toBe("base");
    expect(game.state("crew").might).toBe(3);
    expect(game.state("crew").isExhausted).toBe(true);
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "crew").build();
    expect(poor.p1.can("play", "crew")).toBe(false);
  });

  // Expected: the gear play triggers "ready me". Actual: the card's trigger event is
  // `play-gear`, but playGear fires `play-card {cardType: gear}` — nothing matches, no ready.
  test.failing("BUG: playing a gear should ready an exhausted Pit Crew (trigger never fires)", async () => {
    const game = await board().build();
    expect(game.state("crew").isExhausted).toBe(true);
    await game.p1.play("wrench");
    await game.settle();
    expect(game.zoneOf("wrench")).toBe("base");
    expect(game.state("crew").isReady).toBe(true);
  });

  // Expected: enters exhausted, then the gear play readies it. Actual: stays exhausted (see above).
  test.failing("BUG: Pit Crew played this turn should be readied by a following gear play", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "crew").hand(P1, WRENCH, "wrench").build();
    await game.p1.play("crew");
    await game.settle();
    expect(game.state("crew").isExhausted).toBe(true);
    await game.p1.play("wrench");
    await game.settle();
    expect(game.state("crew").isReady).toBe(true);
  });

  test("'you': an opponent playing a gear does not ready it", async () => {
    const game = await board(P2).build();
    await game.p2.play("theirs");
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.state("crew").isExhausted).toBe(true);
  });

  test("'a gear': playing a unit or a spell does not ready it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", CARD, "crew", { exhausted: true })
      .hand(P1, RECRUIT, "recruit")
      .hand(P1, DISCIPLINE, "spell")
      .build();
    await game.p1.play("recruit");
    await game.settle();
    expect(game.state("crew").isExhausted).toBe(true);
    await game.p1.cast("spell", { targets: "crew" });
    await game.settle();
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.state("crew").isExhausted).toBe(true);
  });
});
