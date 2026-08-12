/**
 * Ruling 739cc89efd84bfd8 — Draven, Audacious (SFD-148 → sfd-148-221) · Unit · Chaos · [6][chaos] · 6 Might
 *   "[Deflect] / The first time I win a combat each turn, you score 1 point. / When I die in combat, choose an
 *    opponent. They score 1 point."
 *
 * Q: At 7 points my opponent moves Draven to an EMPTY battlefield — does he take the 8th? And if instead I have a
 *    unit there and Draven wins the combat?
 * A: Empty battlefield: no. That point would come from a Conquer, and the Final Point restriction blocks it unless
 *    every battlefield was already scored this turn — he draws a card instead. Winning a combat: yes. Draven's
 *    triggered ability is not a Conquer/Hold, so the Final Point restriction does not apply and he wins at 8.
 * Rules: 448.1.b.2 (final point via Conquer/Hold ⇒ draw instead), 448.1.a.1 (other point sources exempt),
 *        446.1 (moving to an empty battlefield conquers it), 322.1 (reaching the Victory Score wins).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DRAVEN_AUDACIOUS = "sfd-148-221";

/**
 * P2's turn at 7 of 8 points. P1 holds BF A (so P2 has NOT scored every battlefield this turn); BF B is the target.
 * `defenderMight === 0` leaves BF B empty.
 */
function board(defenderMight: number) {
  return scenario()
    .turn(2)
    .active(P2)
    .points(P2, 7)
    .victoryScore(8)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: null })
    .unit(P1, "bfA", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "base", DRAVEN_AUDACIOUS, "draven");
}

describe("Ruling 739cc89efd84bfd8 — Draven at 7 points: no 8th from a Conquer, but yes from his combat trigger", () => {
  test("1. moving Draven onto an EMPTY battlefield conquers it but the Final Point is refused — he draws instead", async () => {
    const game = await board(0).build();
    const handBefore = game.p2.hand().length;
    await game.p2.move("draven", "bfB");
    await game.settle();
    expect(game.gameState.battlefields.bfB?.controller).toBe(P2); // the Conquer itself happened
    expect(game.p2.points()).toBe(7); // …but not the 8th point
    expect(game.p2.hand().length).toBe(handBefore + 1); // 448.1.b.2 — draw a card instead
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
  });

  test("1b. no combat happened at the empty battlefield, so his 'win a combat' trigger never fires", async () => {
    const game = await board(0).build();
    await game.p2.move("draven", "bfB");
    await game.settle();
    expect(game.state("draven").combatRole).toBeNull();
    expect(game.chain()).toEqual([]);
    expect(game.p2.points()).toBe(7);
  });

  test("2. with a defender there Draven wins the combat, and THAT point is not a Conquer — he reaches 8 and wins", async () => {
    const game = await board(2).unit(P1, "bfB", { might: 2, name: "Chaff" }, "chaff").build();
    await game.p2.move("draven", "bfB");
    expect(game.state("draven").combatRole).toBe("attacker");
    await game.settle();
    expect(game.zoneOf("chaff")).toBe("trash");
    expect(game.p2.points()).toBeGreaterThanOrEqual(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
  });
});
