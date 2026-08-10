/**
 * Ruling 34583b7f8101eda1 — Peak Guardian (OGN-223 → ogn-223-298) · Unit · Order · 6 · 5 Might
 *   "When you play me, buff me. Then, if I am at a battlefield, buff all other friendly units there."
 *
 * Q: Is Peak Guardian's buff an ongoing aura while it is on the battlefield, or a one-time effect when played?
 * A: One-time. Played directly to a battlefield it buffs the other friendly units there ONCE; the buffs stay on those
 *    units, but units arriving later get nothing. It must be played to the battlefield for the mass buff to happen.
 * Rules: 702 (a buff is a persistent object on the unit, not a static bonus), 383 (play trigger resolves once).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const PEAK_GUARDIAN = "ogn-223-298";

/** P1's turn, 6 energy + [order]. P1 holds bf1 with Ally (2); Latecomer (2) waits in base; Peak Guardian in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
    .unit(P1, "base", { might: 2, name: "Latecomer" }, "late")
    .hand(P1, PEAK_GUARDIAN, "pg");
}

async function playedToBattlefield(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("pg", { to: "bf1" });
  await game.settle();
  expect(game.zoneOf("pg")).toBe("battlefield-bf1");
  return game;
}

describe("Ruling 34583b7f8101eda1 — Peak Guardian buffs once on play; no aura", () => {
  test("played to a controlled battlefield: Peak Guardian buffs itself and the other friendly unit there once (Ally 2 → 3); the unit in base is not 'there' and gets nothing", async () => {
    const game = await playedToBattlefield();
    expect(game.state("pg")).toMatchObject({ isBuffed: true, might: 6 });
    expect(game.state("ally")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("late")).toMatchObject({ isBuffed: false, might: 2 });
    expect(game.chain()).toEqual([]);
  });

  test("not an aura: a unit that moves to Peak Guardian's battlefield afterwards is NOT buffed", async () => {
    const game = await playedToBattlefield();
    await game.p1.move("late", "bf1");
    await game.settle();
    expect(game.locationOf("late")).toBe("bf1");
    expect(game.state("late")).toMatchObject({ isBuffed: false, might: 2 });
    expect(game.state("ally")).toMatchObject({ isBuffed: true, might: 3 });
  });

  test("the buff is a persistent object: it remains on Ally across turns (and the latecomer still has none)", async () => {
    const game = await playedToBattlefield();
    await game.p1.move("late", "bf1");
    await game.advanceTurn();
    await game.advanceTurn(); // back to P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("ally")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("pg")).toMatchObject({ isBuffed: true, might: 6 });
    expect(game.state("late")).toMatchObject({ isBuffed: false, might: 2 });
    expect(game.violations()).toEqual([]);
  });

  test("must be played TO the battlefield: played to base it only buffs itself — Ally at bf1 gets nothing, and moving Peak Guardian there later changes nothing", async () => {
    const game = await board().build();
    await game.p1.play("pg", { to: "base" });
    await game.settle();
    expect(game.state("pg")).toMatchObject({ isBuffed: true, might: 6, zone: "base" });
    expect(game.state("ally")).toMatchObject({ isBuffed: false, might: 2 });
    await game.advanceTurn();
    await game.advanceTurn(); // P1's next turn: Peak Guardian (entered exhausted) is ready
    await game.p1.move("pg", "bf1");
    await game.settle();
    expect(game.locationOf("pg")).toBe("bf1");
    expect(game.state("ally")).toMatchObject({ isBuffed: false, might: 2 });
  });
});
