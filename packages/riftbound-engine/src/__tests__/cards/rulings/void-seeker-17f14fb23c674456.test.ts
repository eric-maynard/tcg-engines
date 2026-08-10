/**
 * Ruling 17f14fb23c674456 — Void Seeker (OGN-024 → ogn-024-298) · Action spell · Fury · [3][fury]
 *     "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Smoke Screen (OGN-093 → ogn-093-298) · Reaction spell · Mind · [2][mind]
 *     "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   on Darius, Trifarian (ogn-027-298) · 5 Might.
 *
 * Q: Void Seeker hits Darius (4 damage, "1 life left"), then Smoke Screen drops his Might to 1 — does he die?
 * A: Yes. After Void Seeker Darius is 5 Might with 4 damage marked (alive). Smoke Screen makes him 1 Might with
 *    4 damage; damage (4) ≥ Might (1) so he dies in the cleanup. "Life" isn't a thing — damage is compared to Might.
 * Rules: 432 (damage is marked, not subtracted), 520/state-based cleanup (damage ≥ Might → killed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const SMOKE_SCREEN = "ogn-093-298";
const DARIUS = "ogn-027-298";

/** P1's turn. P2's Darius (5) holds bf1. P1 holds Void Seeker + Smoke Screen with exactly [5] + [fury][mind]. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", DARIUS, "darius")
    .hand(P1, VOID_SEEKER, "seeker")
    .hand(P1, SMOKE_SCREEN, "smoke")
    .resources(P1, { energy: 5, power: { fury: 1, mind: 1 } });
}

async function voidSeekerHitsDarius(game: Game): Promise<void> {
  await game.p1.cast("seeker", { targets: "darius" });
  expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0, mind: 1 } });
  await game.settle();
  expect(game.zoneOf("seeker")).toBe("trash");
}

describe("Ruling 17f14fb23c674456 — Void Seeker (4 dmg) then Smoke Screen (-4 Might) kills a 5-Might Darius", () => {
  test("after Void Seeker: Darius is still 5 Might with 4 damage MARKED and survives (damage < Might); P1 drew 1", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await voidSeekerHitsDarius(game);
    expect(game.zoneOf("darius")).toBe("battlefield-bf1");
    expect(game.state("darius")).toMatchObject({ baseMight: 5, damage: 4, might: 5 });
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
  });

  test("then Smoke Screen: Might → 1 with 4 damage still marked ⇒ 4 ≥ 1, Darius dies in the cleanup", async () => {
    const game = await board().build();
    await voidSeekerHitsDarius(game);
    expect(game.p1.can("cast", "smoke")).toBe(true);
    await game.p1.cast("smoke", { targets: "darius" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0 } });
    await game.settle();
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.zoneOf("darius")).toBe("trash");
    expect(game.p2.units()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: Smoke Screen alone (no damage marked) leaves Darius alive at 1 Might — Might reduction is not damage", async () => {
    const game = await board().build();
    await game.p1.cast("smoke", { targets: "darius" });
    await game.settle();
    expect(game.zoneOf("darius")).toBe("battlefield-bf1");
    expect(game.state("darius")).toMatchObject({ damage: 0, might: 1 });
  });
});
