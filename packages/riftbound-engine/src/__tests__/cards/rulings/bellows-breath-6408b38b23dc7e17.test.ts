/**
 * Ruling 6408b38b23dc7e17 — Bellows Breath (SFD-080 → sfd-080-221) · Action · [1][mind] · "[Repeat] [1][mind] … Deal 1 to up to three
 *     units at the same location."
 *   × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · [7][mind] · 7 Might · "When you play me, give enemy units -3 [Might] this turn,
 *     to a minimum of 1 [Might]."
 *
 * Q: My opponent Bellows Breaths my unit, then plays Thousand-Tailed Watcher — does the unit die?
 * A: Yes, if the −3 brings its Might down to (or below) the damage already marked on it. Damage is marked and stays; the Watcher's
 *    trigger resolves and lowers Might; the state check then kills any unit whose marked damage ≥ its current Might.
 * Rules: 428 (a unit with damage ≥ Might dies at the next cleanup), 160/703 (damage is marked, Might modifiers are separate).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";
const WATCHER = "ogn-116-298";

/** P2's turn with [8] + mind×2. P1 holds bf1 with Victim (4) and Sturdy (5). P2: Bellows Breath + Watcher in hand. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 8, power: { mind: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Victim" }, "victim")
    .unit(P1, "bf1", { might: 5, name: "Sturdy" }, "sturdy")
    .hand(P2, BELLOWS_BREATH, "bb")
    .hand(P2, WATCHER, "watcher");
}

/** Bellows Breath (no Repeat) on Victim + Sturdy → 1 marked on each. */
async function breathe(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("bb", { targets: ["victim", "sturdy"] });
  expect(game.p2.resources()).toEqual({ energy: 7, power: { mind: 1 } });
  await game.settle();
  expect(game.zoneOf("bb")).toBe("trash");
  return game;
}

/** Play the Watcher and let its trigger resolve. */
async function playWatcher(game: Game): Promise<void> {
  const before = game.p2.resources();
  await game.p2.play("watcher");
  expect(game.p2.resources()).toEqual({ energy: before.energy - 7, power: { mind: (before.power.mind ?? 0) - 1 } });
  await game.settle();
  expect(game.zoneOf("watcher")).toBe("base");
}

describe("Ruling 6408b38b23dc7e17 — Bellows Breath damage stays marked; the Watcher's −3 then makes it lethal", () => {
  test("step 1: Bellows Breath marks 1 damage on each target and reduces nobody's Might (Victim 4 with 1, Sturdy 5 with 1)", async () => {
    const game = await breathe();
    expect(game.state("victim")).toMatchObject({ damage: 1, might: 4, zone: "battlefield-bf1" });
    expect(game.state("sturdy")).toMatchObject({ damage: 1, might: 5, zone: "battlefield-bf1" });
  });

  test("step 2–4: the Watcher's 'When you play me' goes on the chain, resolves for −3 (min 1) → Victim is 1 Might with 1 damage and DIES; Sturdy is 2 Might with 1 damage and lives", async () => {
    const game = await breathe();
    await game.p2.play("watcher");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "watcher", controller: P2, triggered: true })]);
    expect(game.zoneOf("victim")).toBe("battlefield-bf1"); // nothing happens until the trigger resolves
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.state("sturdy")).toMatchObject({ damage: 1, might: 2, mightModifier: -3, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // Sturdy still holds it
    expect(game.violations()).toEqual([]);
  });

  test("with the Repeat paid (2 damage each) the 5-Might Sturdy dies too: 5 − 3 = 2 ≤ 2 marked", async () => {
    const game = await board().resources(P2, { energy: 9, power: { mind: 3 } }).build();
    await game.p2.cast("bb", { repeat: 1, targets: ["victim", "sturdy"] });
    await game.settle();
    expect(game.state("victim").damage).toBe(2);
    expect(game.state("sturdy").damage).toBe(2);
    await playWatcher(game);
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("sturdy")).toBe("trash");
  });

  test("control: the Watcher alone (no damage marked) kills nothing — Might can't drop below 1", async () => {
    const game = await board().build();
    await playWatcher(game);
    expect(game.state("victim")).toMatchObject({ damage: 0, might: 1, zone: "battlefield-bf1" });
    expect(game.state("sturdy")).toMatchObject({ damage: 0, might: 2, zone: "battlefield-bf1" });
  });
});
