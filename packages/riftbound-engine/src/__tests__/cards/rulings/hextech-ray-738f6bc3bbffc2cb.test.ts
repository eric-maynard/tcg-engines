/**
 * Ruling 738f6bc3bbffc2cb — Hextech Ray (OGN-009 → ogn-009-298) · Action · 1+[fury] "Deal 3 to a unit at a battlefield."
 *   × Darius, Trifarian (OGN-027 → ogn-027-298) · 5 Might
 *   × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · 7+[mind] "When you play me, give enemy units -3 [Might] this turn, to a
 *     minimum of 1 [Might]."
 *
 * Q: Darius (holding a battlefield) takes 3 from Hextech Ray, THEN the Watcher reduces his Might by 3. Does he die?
 * A: Yes. Marked damage stays; when the Watcher's ability resolves Darius is a 2-Might unit with 3 damage (damage ≥ Might),
 *    so he dies. Dealing the damage first does not protect him — lethality is checked continuously, not only when damage lands.
 * Rules: 142 (damage persists for the turn), 140.3 / 323.1 (damage ≥ Might → killed in Cleanup), 318 (Cleanup after resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";
const DARIUS = "ogn-027-298";
const WATCHER = "ogn-116-298";

/** P1's turn. P2's Darius (5) holds bf1. P1: Ray + Watcher in hand, exactly 1+[fury] + 7+[mind]. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { fury: 1, mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", DARIUS, "darius")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P1, WATCHER, "watcher");
}

async function rayDarius(game: Game): Promise<void> {
  await game.p1.cast("ray", { targets: "darius" });
  await game.settle();
  expect(game.zoneOf("ray")).toBe("trash");
}

describe("Ruling 738f6bc3bbffc2cb — 3 damage first, then -3 Might from the Watcher: Darius dies", () => {
  test("step 1: Hextech Ray marks 3 damage on the 5-Might Darius — he survives (3 < 5) and keeps holding bf1", async () => {
    const game = await board().build();
    await rayDarius(game);
    expect(game.state("darius")).toMatchObject({ damage: 3, might: 5, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("step 2: P1 plays the Watcher; its play trigger gives Darius -3 → 2 Might with 3 damage still marked → he dies in the Cleanup after the trigger resolves", async () => {
    const game = await board().build();
    await rayDarius(game);
    await game.p1.play("watcher", { to: "base" });
    // The damage is still marked while the Watcher's trigger waits on the chain.
    if (game.chain().length > 0) {
      expect(game.chain()).toEqual([expect.objectContaining({ cardId: "watcher", controller: P1, triggered: true })]);
      expect(game.state("darius")).toMatchObject({ damage: 3, might: 5 });
    }
    await game.settle();
    expect(game.zoneOf("watcher")).toBe("base");
    expect(game.zoneOf("darius")).toBe("trash"); // 3 damage ≥ 2 Might
    expect(game.p2.trash()).toContain("darius");
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("control: the Watcher alone (no prior damage) just makes Darius a 2-Might unit for the turn — no death without marked damage", async () => {
    const game = await board().build();
    await game.p1.play("watcher", { to: "base" });
    await game.settle();
    expect(game.state("darius")).toMatchObject({ damage: 0, might: 2, mightModifier: -3, zone: "battlefield-bf1" });
    await game.advanceTurn();
    expect(game.state("darius").might).toBe(5);
  });
});
