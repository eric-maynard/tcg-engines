/**
 * Ruling 714707afae831357 — Bellows Breath (SFD-080 → sfd-080-221) · Action · [1][mind] "[Repeat][1][mind] Deal 1 to up to three
 *   units at the same location." × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · 7+[mind] · 7 Might "[Accelerate] When you
 *   play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: If I first Bellows Breath an enemy 4-Might unit and then play the Watcher, does it die?
 * A: Yes. Bellows marks 1 damage (Might stays 4). The Watcher's play trigger then gives it -3 Might → 1. After that
 *    resolves the unit has 1 damage ≥ 1 Might and is killed. Damage is marked, it does not reduce Might.
 * Rules: 142.2.a (lethal = marked damage ≥ Might, checked after an effect resolves), 383 (play trigger on the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";
const WATCHER = "ogn-116-298";

/** P1's turn with [8] + [mind][mind]. P2 holds bf1 with a 4-Might Brute (and a 5-Might Hulk as a non-lethal contrast). */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { mind: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Brute" }, "brute")
    .unit(P2, "bf1", { might: 5, name: "Hulk" }, "hulk")
    .hand(P1, BELLOWS_BREATH, "bb")
    .hand(P1, WATCHER, "watcher");
}

async function bellowsOnBrute(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("bb", { targets: ["brute", "hulk"] });
  await game.settle();
  expect(game.zoneOf("bb")).toBe("trash");
  return game;
}

describe("Ruling 714707afae831357 — Bellows Breath damage + Watcher's -3 Might kills a 4-Might unit", () => {
  test("step 1: Bellows Breath marks 1 damage on the Brute; its Might is still 4 (damage does not reduce Might)", async () => {
    const game = await bellowsOnBrute();
    expect(game.state("brute")).toMatchObject({ damage: 1, might: 4, zone: "battlefield-bf1" });
    expect(game.state("hulk")).toMatchObject({ damage: 1, might: 5 });
  });

  test("step 2–3: playing the Watcher puts its 'When you play me' trigger on the chain; nothing dies before it resolves", async () => {
    const game = await bellowsOnBrute();
    await game.p1.play("watcher");
    expect(game.zoneOf("watcher")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "watcher", controller: P1, triggered: true })]);
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.state("brute").might).toBe(4);
  });

  test("step 4: the trigger resolves → Brute is 1 Might with 1 damage ⇒ killed; the Hulk (5→2 Might, 1 damage) survives", async () => {
    const game = await bellowsOnBrute();
    await game.p1.play("watcher");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.state("hulk")).toMatchObject({ damage: 1, might: 2, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the Watcher alone (no prior damage) only shrinks the Brute to 1 Might — it does not die", async () => {
    const game = await board().build();
    await game.p1.play("watcher");
    await game.settle();
    expect(game.state("brute")).toMatchObject({ damage: 0, might: 1, zone: "battlefield-bf1" });
  });
});
