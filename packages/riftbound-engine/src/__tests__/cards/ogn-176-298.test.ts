/**
 * Sneaky Deckhand — ogn-176-298 · Unit · Chaos · 3 energy · 2 Might
 *
 *   You may play me to an open battlefield.
 *
 * Rules: 170.11.c — a battlefield is "open" when it is unoccupied AND uncontrolled. Normally a
 * unit may only be played to your base or a battlefield you control. 190.3.a.1 — a unit played to
 * a battlefield its controller doesn't control applies Contested → Showdown → control/conquer.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-176-298";
const VANILLA = "ogn-175-298";

function board(energy = 3) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("mineBf", { controller: P1 })
    .battlefield("openBf", { controller: null })
    .battlefield("enemyBf", { controller: P2 })
    .unit(P1, "mineBf", { might: 1 }, "holder")
    .unit(P2, "enemyBf", { might: 2 }, "foe")
    .hand(P1, CARD, "sd")
    .hand(P1, VANILLA, "plain");
}

function playLocations(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>, card: string) {
  return [...((game.p1.option("play", card)?.fields.find((f) => f.arg === "to")?.options as string[]) ?? [])].sort();
}

describe("Sneaky Deckhand (ogn-176-298)", () => {
  test("costs 3 energy; played to base it enters exhausted as a 2-Might unit; 2 energy is not enough", async () => {
    const game = await board().build();
    await game.p1.play("sd", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("sd")).toBe("base");
    expect(game.state("sd").might).toBe(2);
    expect(game.state("sd").isExhausted).toBe(true);
    const poor = await board(2).build();
    expect(poor.p1.can("play", "sd")).toBe(false);
  });

  test("may be played to an open (uncontrolled, unoccupied) battlefield — a vanilla unit may not", async () => {
    const game = await board().build();
    expect(playLocations(game, "sd")).toEqual(["base", "battlefield-mineBf", "battlefield-openBf"]);
    expect(playLocations(game, "plain")).toEqual(["base", "battlefield-mineBf"]);
    await game.p1.play("sd", { to: "openBf" });
    expect(game.zoneOf("sd")).toBe("battlefield-openBf");
    expect(game.p1.energy()).toBe(0);
  });

  test("an enemy-controlled battlefield is not open: not a legal destination", async () => {
    const game = await board().build();
    const t = await game.p1.try((p) => p.play("sd", { to: "enemyBf" }));
    expect(!t.ok && t.error.code).toBe("ILLEGAL_ARGS");
    expect(game.zoneOf("sd")).toBe("hand");
  });

  test.failing("BUG: an uncontrolled battlefield that has units on it is not 'open' (170.11.c) and must not be offered", async () => {
    // Expected: "open" = unoccupied AND uncontrolled, so an uncontrolled battlefield holding an enemy
    // unit is not a legal destination. Actual: the engine only checks "uncontrolled" and offers it.
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("openBf", { controller: null })
      .battlefield("occupied", { controller: null })
      .unit(P2, "occupied", { might: 2 }, "squatter")
      .hand(P1, CARD, "sd")
      .build();
    expect(playLocations(game, "sd")).toEqual(["base", "battlefield-openBf"]);
    const t = await game.p1.try((p) => p.play("sd", { to: "occupied" }));
    expect(t.ok).toBe(false);
  });

  test.failing("BUG: playing it to an open battlefield contests it — after the showdown P1 controls it and scores 1 (190.3.a.1, 466.5)", async () => {
    // Expected: the Deckhand arriving at an uncontrolled battlefield applies Contested; a showdown
    // opens in the next cleanup; with no opposition P1 establishes control (a conquer → 1 point).
    // Actual: the battlefield stays uncontrolled and uncontested; no showdown, no point.
    const game = await board().build();
    await game.p1.play("sd", { to: "openBf" });
    await game.settle();
    expect(game.gameState.battlefields.openBf?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
