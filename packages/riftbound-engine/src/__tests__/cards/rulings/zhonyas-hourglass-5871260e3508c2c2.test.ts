/**
 * Ruling 5871260e3508c2c2 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2 · [Hidden] "If a friendly unit would
 *   die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Smoke Screen (OGN-093 → ogn-093-298) · [Reaction] · 2+[mind] "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   (+ Void Seeker ogn-024-298 "Deal 4 to a unit at a battlefield. Draw 1." as the killing blow Zhonya's replaces)
 *
 * Q: Does Zhonya's recall wipe a "this turn" Might reduction like Smoke Screen's?
 * A: No. The recall heals DAMAGE only; stat modifications stay until they expire at end of turn.
 * Rules: 372 (replacement does exactly what it says: heal / exhaust / recall), 423 (heal removes damage), 700–701
 *        (Might modifiers persist for their duration), 317.2 (expire at end of turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const SMOKE_SCREEN = "ogn-093-298";
const VOID_SEEKER = "ogn-024-298";

/** P2's turn: Smoke Screen (2+[mind]) + Void Seeker (3+[fury]). P1: Brute (5) holding bf1, face-up Zhonya's in base. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 5, power: { fury: 1, mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 5, name: "Brute" }, "brute")
    .gear(P1, ZHONYAS, "zh")
    .hand(P2, SMOKE_SCREEN, "smoke")
    .hand(P2, VOID_SEEKER, "vs");
}

/** Smoke Screen the Brute (5 → 1), then Void Seeker it: 4 damage would kill it, Zhonya's steps in. */
async function smokeThenSeeker(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("smoke", { targets: "brute" });
  await game.settle();
  expect(game.zoneOf("smoke")).toBe("trash");
  expect(game.state("brute").might).toBe(1);
  await game.p2.cast("vs", { targets: "brute" });
  await game.settle();
  expect(game.zoneOf("vs")).toBe("trash");
  return game;
}

describe("Ruling 5871260e3508c2c2 — Zhonya's clears damage, not Smoke Screen's -4", () => {
  test("Zhonya's replaces the death: Hourglass killed instead, Brute recalled to base exhausted with its DAMAGE healed to 0…", async () => {
    const game = await smokeThenSeeker();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("base");
    expect(game.state("brute")).toMatchObject({ damage: 0, isExhausted: true });
  });

  test("…but the Might reduction remains: the recalled Brute is still 1 Might (base 5, -4) for the rest of the turn", async () => {
    const game = await smokeThenSeeker();
    expect(game.state("brute").baseMight).toBe(5);
    expect(game.state("brute").might).toBe(1);
    expect(game.state("brute").mightModifier).toBe(-4);
    expect(game.turnPlayer()).toBe(P2);
  });

  test("the reduction expires normally at end of turn: next turn the Brute is back to 5", async () => {
    const game = await smokeThenSeeker();
    await game.advanceTurn(); // P2 ends → P1's turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("brute")).toBe("base");
    expect(game.state("brute").might).toBe(5);
    expect(game.state("brute").mightModifier).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
