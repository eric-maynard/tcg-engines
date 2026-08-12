/**
 * Ruling 2d3df5615bb09954 — Sun Disc (OGN-021 → ogn-021-298) · Gear · Fury · [2][fury]
 *     "[Exhaust]: [Legion] — The next unit you play this turn enters ready."
 *
 * Q: Can I play Sun Disc as the first card of my turn and immediately exhaust it for its Legion ability?
 * A: No. Legion is shorthand for "if you have played ANOTHER card this turn"; a card never counts itself
 *    (rule 812.1.b.1 / 812.1.c). Play some other card first, then the ability is active and exhausting
 *    Sun Disc makes your next unit that turn enter ready.
 * Rules: 812.1.b.1 / 812.1.c (Legion = another card), 724 (dependent abilities).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const SUN_DISC = "ogn-021-298";
const EN_GARDE = "ogn-046-298"; // the cheap "another card" (Reaction, [1][calm])

/** P1's main phase with Sun Disc + En Garde in hand and enough for both plus a 2-Might unit. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { fury: 1, calm: 1 } })
    .unit(P1, "base", { might: 1, name: "Anchor" }, "anchor")
    .hand(P1, SUN_DISC, "disc")
    .hand(P1, EN_GARDE, "engarde")
    .hand(P1, { cardType: "unit", might: 3, energyCost: 1, name: "Recruit" }, "recruit");
}

describe("Ruling 2d3df5615bb09954 — Sun Disc does not satisfy its own Legion", () => {
  test("premise: with nothing played yet, an already-deployed Sun Disc cannot be exhausted for its ability", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .gear(P1, SUN_DISC, "disc")
      .hand(P1, { cardType: "unit", might: 3, energyCost: 1, name: "Recruit" }, "recruit")
      .build();
    expect(game.p1.can("activate", "disc")).toBe(false);
    expect(game.state("disc").isExhausted).toBe(false);
  });

  test("ruling: playing Sun Disc as the FIRST card of the turn still leaves its Legion inactive", async () => {
    const game = await board().build();
    await game.p1.play("disc");
    await game.settle();
    expect(game.zoneOf("disc")).toBe("base");
    expect(game.p1.can("activate", "disc")).toBe(false);
  });

  test("…and after another card has been played this turn the ability switches on", async () => {
    const game = await board().build();
    await game.p1.play("disc");
    await game.settle();
    await game.p1.cast("engarde", { targets: "anchor" });
    await game.settle();
    expect(game.p1.can("activate", "disc")).toBe(true);
  });

  test("full correct sequence: other card → Sun Disc → exhaust → the next unit enters READY", async () => {
    const game = await board().build();
    await game.p1.cast("engarde", { targets: "anchor" }); // the "another card"
    await game.settle();
    await game.p1.play("disc");
    await game.settle();
    expect(game.p1.can("activate", "disc")).toBe(true);
    await game.p1.activate("disc");
    await game.settle();
    expect(game.state("disc").isExhausted).toBe(true);
    await game.p1.play("recruit");
    await game.settle();
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.state("recruit").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("control: without the Sun Disc replacement a freshly played unit enters exhausted", async () => {
    const game = await board().build();
    await game.p1.play("recruit");
    await game.settle();
    expect(game.state("recruit").isExhausted).toBe(true);
  });
});
