/**
 * Time Warp — ogn-122-298 · Spell · Mind · 10 energy + 4 [mind]
 *
 *   Take a turn after this one. Banish this.
 *
 * Rules 734–738: "take a turn after this one" inserts one Additional Turn for
 * the resolving player right after the current turn; the normal turn order
 * resumes afterwards. No [Action]/[Reaction] keyword: base spell timing only.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-122-298";

function board() {
  return scenario().resources(P1, { energy: 10, power: { mind: 4 } }).hand(P1, CARD, "warp");
}

describe("Time Warp (ogn-122-298)", () => {
  test("costs 10 energy + 4 mind", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "warp")).toBe(true);
    await game.p1.cast("warp");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("warp")).toBe("chain");
    const lowEnergy = await scenario().resources(P1, { energy: 9, power: { mind: 4 } }).hand(P1, CARD, "warp").build();
    expect(lowEnergy.p1.can("cast", "warp")).toBe(false);
    const lowPower = await scenario().resources(P1, { energy: 10, power: { mind: 3 } }).hand(P1, CARD, "warp").build();
    expect(lowPower.p1.can("cast", "warp")).toBe(false);
  });

  test("'Banish this': the spell goes to banishment, not the trash, when it resolves", async () => {
    const game = await board().build();
    await game.p1.cast("warp");
    await game.settle();
    expect(game.zoneOf("warp")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("warp");
  });

  test("'Take a turn after this one': after this turn ends the caster takes the next turn, then normal order resumes", async () => {
    const game = await board().turn(3).build();
    await game.p1.cast("warp");
    await game.settle();
    expect(game.turnPlayer()).toBe(P1); // still the current turn
    expect(game.turnNumber()).toBe(3);
    const extra = await game.advanceTurn();
    expect(extra.next).toBe(P1);
    expect(game.turnNumber()).toBe(4);
    expect(game.phase()).toBe("main");
    // The additional turn is a full turn: P1 channels 2 runes and draws during it.
    expect(game.p1.runes()).toHaveLength(2);
    const after = await game.advanceTurn();
    expect(after.next).toBe(P2);
    const back = await game.advanceTurn();
    expect(back.next).toBe(P1);
  });

  test("only one additional turn is created per Time Warp", async () => {
    const game = await board().build();
    await game.p1.cast("warp");
    await game.settle();
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      order.push((await game.advanceTurn()).next);
    }
    expect(order).toEqual([P1, P2, P1, P2]);
  });

  test("no timing keyword: not playable on the opponent's turn (rule 155)", async () => {
    const opp = await board().active(P2).build();
    expect(opp.p1.can("cast", "warp")).toBe(false);
  });

  test.failing("BUG: no [Action]/[Reaction] keyword — not playable during a showdown or onto a chain (rules 155, 308.1.a)", async () => {
    // Expected: Time Warp's text has no [Action], so it is illegal while a showdown is open.
    // Actual: the card data declares `timing: "action"`, so the engine offers it with Focus.
    const opp = await board().active(P2).build();
    expect(opp.p1.can("cast", "warp")).toBe(false);

    const game = await board()
      .resources(P1, { energy: 11, power: { mind: 4, fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf1", { might: 9 }, "wall")
      .hand(P1, "ogn-009-298", "ray")
      .build();
    await game.p1.move("ally", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "warp")).toBe(false);
    await game.p1.cast("ray", { targets: "wall" }); // an [Action] spell is fine here; now a chain exists
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.p1.can("cast", "warp")).toBe(false);
  });
});
