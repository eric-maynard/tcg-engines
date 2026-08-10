/**
 * Ruling 9376784835a8848b — Void Seeker (OGN-024 → ogn-024-298) · Spell · Fury · 3+[fury] · [Action]
 *     "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Smoke Screen (OGN-093 → ogn-093-298) · 2+[mind] · [Reaction] "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: Void Seeker puts 4 damage on a 7-Might unit, then Smoke Screen drops it by 4 Might — does it die?
 * A: Yes. At the next cleanup damage (4) ≥ Might (3) → it dies. Either order works as long as the damage isn't healed
 *    in between.
 * Rules: 323 / 142.4 (cleanup: a unit with damage ≥ its Might is killed), damage persists until healed/end of turn.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const SMOKE_SCREEN = "ogn-093-298";

/** P1's turn with exactly (3+[fury]) + (2+[mind]). P2's X (7) at P2's bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 1, mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "X" }, "x")
    .hand(P1, VOID_SEEKER, "vs")
    .hand(P1, SMOKE_SCREEN, "smoke");
}

describe("Ruling 9376784835a8848b — 4 damage + Smoke Screen's -4 kills a 7-Might unit at cleanup", () => {
  test("damage first: Void Seeker resolves → X carries 4 damage and lives (4 < 7); then Smoke Screen resolves → Might 3 with 4 damage → X dies in the following cleanup", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.cast("vs", { targets: "x" });
    await game.settle();
    expect(game.state("x")).toMatchObject({ damage: 4, might: 7, zone: "battlefield-bf1" });
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1); // Void Seeker's draw 1
    expect(game.p1.can("cast", "smoke")).toBe(true);
    await game.p1.cast("smoke", { targets: "x" });
    await game.settle();
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("Might reduction first: Smoke Screen → X is a 3 with no damage (alive); then Void Seeker's 4 ≥ 3 → X dies", async () => {
    const game = await board().build();
    await game.p1.cast("smoke", { targets: "x" });
    await game.settle();
    expect(game.state("x")).toMatchObject({ damage: 0, might: 3, zone: "battlefield-bf1" });
    await game.p1.cast("vs", { targets: "x" });
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
  });

  test("same chain (Smoke Screen played in response to P1's own Void Seeker): Smoke resolves first, then the 4 lands on a 3-Might X → dead", async () => {
    const game = await board().build();
    await game.p1.cast("vs", { targets: "x" });
    await game.p1.cast("smoke", { targets: "x" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "smoke"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("x")).toBe("trash");
  });

  test("contrast — Smoke Screen alone never kills: an undamaged X just sits at 3 Might this turn and is 7 again next turn", async () => {
    const game = await board().build();
    await game.p1.cast("smoke", { targets: "x" });
    await game.settle();
    expect(game.state("x")).toMatchObject({ might: 3, zone: "battlefield-bf1" });
    await game.advanceTurn();
    expect(game.state("x")).toMatchObject({ damage: 0, might: 7, zone: "battlefield-bf1" });
  });
});
