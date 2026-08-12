/**
 * Ruling 936ff8746e99ad1d — (no specific card) does damage survive a Non-Combat Showdown?
 *   Exercised with vanilla units and an inline [Reaction] "Deal 2 to a unit."
 *
 * Q: Does a unit keep damage marked on it after a Non-Combat Showdown ends?
 * A: Yes. Healing happens in exactly two places: the Combat Cleanup (step 3c), and the Ending
 *    Phase's Expiration Step. A Non-Combat Showdown runs no Combat Cleanup, so nothing is healed
 *    when it closes — the damage sits there until the end of the turn.
 * Rules: 466.1.a.1 (the Combat Cleanup inserts "3c. Heal all Units" — and only a Combat has one),
 *        348.2 (a non-combat showdown closes with Establish Control and nothing else),
 *        317.2 (the Expiration Step's 3c heal at the end of the turn), 437 (marked damage persists).
 *   Sibling: healing-noncombat-showdown-3b6f73af22efacbc.test.ts (the healing side of the same coin).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** [Reaction] "Deal 2 to a unit." */
const JAB = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Jab",
  rulesText: "[Reaction] Deal 2 to a unit.",
  timing: "reaction",
} as const;

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1's turn; bfOpen is empty and uncontrolled. P2 holds a Reaction to damage the walker with. */
const board = () =>
  scenario()
    .battlefield("bfOpen", { controller: null })
    .unit(P1, "base", { might: 6, name: "Scout" }, "scout")
    .hand(P2, JAB, "jab");

describe("Ruling 936ff8746e99ad1d — a non-combat showdown heals nothing", () => {
  test("damage marked DURING the non-combat showdown is still there when it closes", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bfOpen");
    expect(showdown(game)).toMatchObject({ active: true, isCombatShowdown: false });
    await game.p1.passFocus();
    await game.p2.cast("jab", { targets: "scout" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("scout").damage).toBe(2);
    await game.settle();
    expect(showdown(game)?.active).toBeFalsy();
    expect(game.state("scout")).toMatchObject({ damage: 2, zone: "battlefield-bfOpen" });
    expect(game.gameState.battlefields.bfOpen?.controller).toBe(P1); // it did conquer (348.2.a)
  });

  test("pre-existing damage survives the whole non-combat showdown too", async () => {
    const game = await scenario()
      .battlefield("bfOpen", { controller: null })
      .unit(P1, "base", { might: 6, name: "Scout" }, "scout", { damage: 3 })
      .build();
    await game.p1.move("scout", "bfOpen");
    await game.settle();
    expect(game.state("scout").damage).toBe(3);
  });

  test("contrast — a COMBAT showdown does run a Combat Cleanup, and the survivor is healed", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Chaff" }, "chaff")
      .unit(P1, "base", { might: 6, name: "Scout" }, "scout", { damage: 3 })
      .build();
    await game.p1.move("scout", "bf1");
    expect(showdown(game)).toMatchObject({ isCombatShowdown: true });
    await game.settle();
    expect(game.zoneOf("chaff")).toBe("trash");
    expect(game.state("scout").damage).toBe(0);
  });

  test("the damage the non-combat showdown left behind clears only at the end of the turn", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bfOpen");
    await game.p1.passFocus();
    await game.p2.cast("jab", { targets: "scout" });
    await game.settle();
    expect(game.state("scout").damage).toBe(2);
    await game.advanceTurn();
    expect(game.state("scout").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
