/**
 * Ruling 835888239cd056ef — (general Champion Zone; exercised with Ahri, Alluring, OGN-066 → ogn-066-298 ·
 *   Champion Unit · Calm · [5] · 4 Might · "When I hold, you score 1 point.")
 *
 * Q: Can a Champion Unit move from the Champion Zone to a battlefield, and how does that work?
 * A: The Champion Zone works like an extension of your hand: the champion cannot use abilities from there, it
 *    can only be PLAYED. Playing it pays its summoning cost and puts it EXHAUSTED into your base or a
 *    battlefield you already control — exactly like playing a unit from hand. From then on it is an ordinary
 *    unit; exhausted units still defend.
 * Rules: 419.1.a (a Champion Unit is played from the Champion Zone), 355.2.a (a unit play may name your base or
 *        a battlefield you control), 421 (units enter exhausted), 464 (exhausted units still defend).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AHRI = "ogn-066-298"; // Champion Unit · [5] + [calm] · 4 Might

/** P1's turn: Ahri in the Champion Zone, bf1 held by P1's Sentry, bf2 held by P2. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { calm: 3, rainbow: 3 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Sentry" }, "sentry")
    .unit(P2, "bf2", { might: 2, name: "Wall" }, "wall")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .champion(P1, AHRI, "ahri");
}

async function built(): Promise<Game> {
  const game = await board().build();
  expect(game.zoneOf("ahri")).toBe("championZone");
  expect(game.p1.champion()).toBe("ahri");
  return game;
}

describe("Ruling 835888239cd056ef — the Champion Zone is a place to play from, nothing else", () => {
  test("she starts in the Champion Zone and the only thing on offer for her is being played", async () => {
    const game = await built();
    expect(game.p1.can("playChampion")).toBe(true);
    // Nothing else about her is actionable from there — she has no activatable ability in the zone.
    expect(game.p1.legal().filter((o) => o.card === "ahri" && o.verb === "activate")).toEqual([]);
  });

  test("playing her to base pays the summoning cost and she enters EXHAUSTED", async () => {
    const game = await built();
    const energyBefore = game.p1.energy();
    await game.p1.playChampion("base");
    await game.settle();
    expect(game.zoneOf("ahri")).toBe("base");
    expect(game.p1.energy()).toBe(energyBefore - 5);
    expect(game.state("ahri")).toMatchObject({ isExhausted: true, might: 4 });
  });

  test("she may be played straight to a battlefield P1 already CONTROLS — but not to the opponent's", async () => {
    const game = await built();
    const field = game.p1.option("playChampion")?.fields.find((f) => f.name === "location" || f.arg === "to");
    const destinations = (field?.options ?? []).map(String);
    expect(destinations.some((d) => d.includes("bf1"))).toBe(true);
    expect(destinations.some((d) => d.includes("bf2"))).toBe(false);
  });

  test("played to bf1 she arrives there exhausted, and the battlefield stays P1's", async () => {
    const game = await built();
    await game.p1.playChampion("bf1");
    await game.settle();
    expect(game.zoneOf("ahri")).toBe("battlefield-bf1");
    expect(game.state("ahri").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("an exhausted champion still defends: P2 attacks bf1 into her and she fights", async () => {
    const game = await built();
    await game.p1.playChampion("bf1");
    await game.settle();
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.move("raider", "bf1");
    expect(game.state("ahri").combatRole).toBe("defender"); // exhausted, and defending anyway
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 4+2 defence beats the 3-Might attacker
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("once played she is an ordinary unit — the Champion Zone is empty and there is nothing left to play from it", async () => {
    const game = await built();
    await game.p1.playChampion("base");
    await game.settle();
    expect(game.p1.champion()).toBeUndefined();
    expect(game.p1.can("playChampion")).toBe(false);
  });
});
