/**
 * Dune Drake — ogn-131-298 · Unit · Body · 5 energy (no power) · 5 Might
 *
 *   When I attack, give me +2 [Might] this turn if there is a ready enemy unit here.
 *
 * Rule 383.4.e — "When I attack" triggers when the unit gains the Attacker designation
 * (a showdown opens at a battlefield holding enemy units). "here" = the Drake's battlefield.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-131-298";

function board(enemyMeta: { exhausted?: boolean } = {}) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 1 }, "foe", enemyMeta)
    .unit(P2, "bf2", { might: 1 }, "elsewhere")
    .unit(P1, "base", CARD, "drake");
}

/** Attack bf1 and pass until the attack trigger has left the chain (still inside the showdown). */
async function attackAndResolveTrigger(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>) {
  await game.p1.move("drake", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drake", triggered: true })]);
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    await game.acting().pass();
  }
  expect((game.decision() as ActionDecision).context).toBe("showdown");
}

describe("Dune Drake (ogn-131-298)", () => {
  test("costs 5 energy (no power); enters the base exhausted as a 5-Might unit; unaffordable with 4", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "drake").build();
    await game.p1.play("drake");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.state("drake")).toMatchObject({ baseMight: 5, isExhausted: true, might: 5 });
    const poor = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "drake").build();
    expect(poor.p1.can("play", "drake")).toBe(false);
  });

  test("on attack with a READY enemy unit here: gets +2 Might this turn (5 → 7)", async () => {
    const game = await board().build();
    expect(game.state("foe").isReady).toBe(true);
    await attackAndResolveTrigger(game);
    expect(game.state("drake").might).toBe(7);
    expect(game.state("drake").baseMight).toBe(5);
  });

  test("on attack with only EXHAUSTED enemy units here: no bonus (a ready enemy at another battlefield doesn't count)", async () => {
    const game = await board({ exhausted: true }).build();
    expect(game.state("foe").isExhausted).toBe(true);
    expect(game.state("elsewhere").isReady).toBe(true);
    await attackAndResolveTrigger(game);
    expect(game.state("drake").might).toBe(5);
  });

  test("'this turn': the +2 wears off at end of turn (Drake wins combat 7 vs 1, then is 5 again next turn)", async () => {
    const game = await board().build();
    await game.p1.move("drake", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("drake")).toBe("battlefield-bf1");
    expect(game.state("drake").might).toBe(7);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("drake").might).toBe(5);
  });

  test("does not trigger when defending", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "drake")
      .unit(P2, "base", { might: 2 }, "attacker")
      .build();
    await game.p2.move("attacker", "bf1");
    expect(game.chain()).toHaveLength(0);
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.state("drake").might).toBe(5);
  });
});
