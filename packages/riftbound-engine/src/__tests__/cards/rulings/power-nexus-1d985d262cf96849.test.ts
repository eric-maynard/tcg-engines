/**
 * Ruling 1d985d262cf96849 — Power Nexus (SFD-214 → sfd-214-221) · Battlefield
 *     "When you hold here, you may pay [rainbow][rainbow][rainbow][rainbow] to score 1 point."
 *
 * Q: At 5 points, can I hold up to 7 and then win by activating Power Nexus for the 8th?
 * A: Yes. The Final Point restriction only bites on points earned by Conquer (and Hold); a point from a card
 *    ability is not restricted, so 7 → 8 off the Nexus wins the game.
 * Rules: 448.1.a.1 / 471.1.b (Final Point restriction is per scoring method), 471 (hold scoring),
 *        383.3.b (the cost rides on the trigger's finalization prompt), 429.3 (runes may be Added while it is open).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const POWER_NEXUS = "sfd-214-221";

/**
 * P1 is on 5 of the 8 points needed and holds two battlefields — the live Power Nexus and a plain one —
 * each with a unit on it. Six ready Rainbow runes are banked for the Nexus' cost.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .victoryScore(8)
    .points(P1, 5)
    .battlefield("nexus", { controller: P1, def: POWER_NEXUS, inert: false })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "nexus", { might: 2, name: "Keeper" }, "keeper")
    .unit(P1, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .runes(P1, "rainbow", 6);
}

/** P2 ends the turn; P1's Beginning Phase scores both holds and offers the Nexus' optional payment. */
async function heldToSeven(): Promise<Game> {
  const game = await board().build();
  await game.p2.endTurn();
  expect(game.p1.points()).toBe(7);
  return game;
}

describe("Ruling 1d985d262cf96849 — hold to 7, then win the game on Power Nexus' ability point", () => {
  test("the two holds take P1 from 5 to 7 — not a win yet", async () => {
    const game = await heldToSeven();
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
  });

  test("the Nexus' hold trigger offers its optional cost at finalization", async () => {
    const game = await heldToSeven();
    expect(game.decision()).toMatchObject({
      kind: "yes-no",
      seat: P1,
      timing: "FIN",
      source: { cardId: "nexus" },
    });
  });

  test("ruling: paying the four [rainbow] scores the 8th point from an ABILITY and wins the game", async () => {
    const game = await heldToSeven();
    for (let i = 0; i < 4; i++) {
      await game.p1.recycleRune(); // Add: rune → 1 Rainbow power, legal while the prompt is open
    }
    expect(game.p1.power("rainbow")).toBe(4);
    await game.p1.yes();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "nexus", triggered: true, controller: P1 })]);
    expect(game.p1.points()).toBe(7); // nothing scored until the item resolves
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("declining the payment leaves P1 on 7 and the game running", async () => {
    const game = await heldToSeven();
    await game.p1.no();
    await game.settle();
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });

  test("contrast: the same final point taken by CONQUER is denied by the Final Point rule", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7); // the conquer point is withheld (471.1.b)
    expect(game.isOver()).toBe(false);
  });
});
