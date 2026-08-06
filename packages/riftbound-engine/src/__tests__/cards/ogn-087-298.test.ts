/**
 * Lecturing Yordle — ogn-087-298 · Unit · Mind · 3 energy · 2 might
 *
 *   [Tank] (I must be assigned combat damage first.)
 *   When you play me, draw 1.
 *
 * Rule 815 (Tank: lethal damage must be assigned to me before non-Tank units of my controller).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-087-298";

describe("Lecturing Yordle (ogn-087-298)", () => {
  test("cost: 3 energy (2 might, Tank keyword); not playable with 2", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "yordle").build();
    await game.p1.play("yordle");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("yordle")).toBe("base");
    expect(game.state("yordle").might).toBe(2);
    expect(game.state("yordle").keywords).toContain("Tank");
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "yordle").build();
    expect(poor.p1.can("play", "yordle")).toBe(false);
  });

  test("when you play me, draw 1 (a triggered ability goes on the chain, then resolves)", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "yordle").build();
    const deck = game.p1.deck().length;
    await game.p1.play("yordle");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yordle", triggered: true })]);
    expect(game.p1.hand()).toHaveLength(0);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck().length).toBe(deck - 1);
  });

  test("Tank: a 2-might attacker must assign its damage to the Yordle first, so the 1-might ally survives", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Ally" }, "ally")
      .unit(P1, "bf1", CARD, "yordle")
      .unit(P2, "base", { might: 2, name: "Attacker" }, "atk")
      .build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("yordle")).toBe("trash"); // took the full 2 (lethal) first
    expect(game.zoneOf("ally")).toBe("battlefield-bf1"); // nothing left over for the ally
    expect(game.zoneOf("atk")).toBe("trash"); // 1 + 2 = 3 defending might kills the 2-might attacker
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
