/**
 * Shadowblade Lurker — ven-096-166 · Unit · Chaos · 5 energy · 5 might
 *
 *   I cost [2] less for each card with my name in your trash.
 *
 * Rule 466 — static self cost modification scaled by a trash count.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ven-096-166";

describe("Shadowblade Lurker (ven-096-166)", () => {
  test("costs the printed 5 with no copies in trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .hand(P1, CARD, "lurker")
      .trash(P1, "ogn-012-298")
      .build();

    expect(game.p1.can("play", "lurker")).toBe(false);
  });

  test("costs [2] less per same-named card in your trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .hand(P1, CARD, "lurker")
      .trash(P1, CARD)
      .trash(P1, CARD)
      .trash(P1, "ogn-012-298")
      .build();

    expect(game.p1.can("play", "lurker")).toBe(true);
    await game.p1.play("lurker");
    await game.settle();

    expect(game.zoneOf("lurker")).toBe("base");
    // 5 printed − 2×2 = 1 charged.
    expect(game.p1.energy()).toBe(2);
  });
});
