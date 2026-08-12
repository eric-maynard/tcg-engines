/**
 * Ruling a80a3ec11c2691b0 — Tryndamere, Barbarian (OGN-034 → ogn-034-298) · Unit · [7][fury][fury] · 8 Might
 *   "When I conquer after an attack, if you assigned 5 or more excess damage to enemy units, you score 1 point."
 *
 * Q: Can Tryndamere's ability get you the 8th point and win the game?
 * A: Yes. Only CONQUERING carries the final-point restriction (you must have scored every battlefield that
 *    turn, else the conquer gives you a card instead of the point). A "you score 1 point" effect has no such
 *    gate, so Tryndamere's trigger delivers the winning 8th point even when the conquer that set it off could
 *    not. The condition is still checked: fewer than 5 excess damage assigned ⇒ no point.
 * Rules: 471.1.a/b.1 (final point / draw instead), 194.2 + 323.1 (win checked in a Cleanup), 465 (damage assignment).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TRYNDAMERE = "ogn-034-298";

/** P1 sits on 7 of 8 points. P2 holds bf1 with one small unit; bf2 is neutral and never scored this turn. */
function onePointFromVictory(defenderMight: number, attacker: "tryndamere" | "vanilla") {
  const s = scenario()
    .victoryScore(8)
    .points(P1, 7)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: defenderMight, name: "Holder" }, "holder");
  return attacker === "tryndamere"
    ? s.unit(P1, "base", TRYNDAMERE, "trynd")
    : s.unit(P1, "base", { might: 8, name: "Barbarian Stand-in" }, "trynd");
}

describe("Ruling a80a3ec11c2691b0 — Tryndamere's score trigger can deliver the winning 8th point", () => {
  test("baseline: a plain conquer at 7/8 points does NOT give the final point — 471.1.b.1 hands the player a card instead", async () => {
    const game = await onePointFromVictory(1, "vanilla").build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("trynd", "bf1");
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // the conquer itself happened
    expect(game.p1.points()).toBe(7); // …but the point did not land
    expect(game.p1.hand().length).toBe(handBefore + 1); // drew instead (471.1.b.1)
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("Tryndamere conquering with 7 excess damage scores the 8th point from his ability and wins", async () => {
    const game = await onePointFromVictory(1, "tryndamere").build();
    await game.p1.move("trynd", "bf1");
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBeGreaterThanOrEqual(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("the ability's own condition still applies — only 3 excess damage (8 Might into a 5-Might blocker) scores nothing", async () => {
    const game = await onePointFromVictory(5, "tryndamere").build();
    await game.p1.move("trynd", "bf1");
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7); // conquer point denied by 471.1.b.1, trigger condition unmet
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
