/**
 * Ezreal, Dashing — sfd-082-221 · Unit · Mind · 4 energy · Might 3 · Champion
 *
 *   When I attack or defend, deal damage equal to my Might to an enemy unit here.
 *   I don't deal combat damage.
 *   [mind]: [Action] — Move me to your base.
 *
 * Rules: 423.1.b (a unit that deals no combat damage still TAKES combat damage),
 * 465.2 (combat damage step), 466.5 (resolution).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-082-221";

describe("Ezreal, Dashing (sfd-082-221)", () => {
  test("attacking: the attack trigger deals 3, but Ezreal deals NO combat damage — the Might-4 defender survives and kills him", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "ez")
      .build();
    expect(game.state("ez").might).toBe(3);

    await game.p1.move("ez", "bf1");
    await game.settle();

    // Attack trigger: 3 damage. Combat: Ezreal contributes 0 → total 3 < 4, Wall lives.
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    // Wall's 4 combat damage is still dealt to Ezreal (Might 3) → lethal.
    expect(game.zoneOf("ez")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("defending: the defend trigger fires, and Ezreal's own combat damage is still zero", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ez")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raid")
      .build();

    await game.p2.move("raid", "bf1");
    await game.settle();

    // Defend trigger deals 3 to the Might-2 raider → it dies before/at cleanup.
    expect(game.zoneOf("raid")).toBe("trash");
    // Ezreal took at most 2 (< 3) and dealt no combat damage of his own.
    expect(game.zoneOf("ez")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
