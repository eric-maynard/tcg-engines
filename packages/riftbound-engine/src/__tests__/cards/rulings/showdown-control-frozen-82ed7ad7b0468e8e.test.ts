/**
 * Ruling 82ed7ad7b0468e8e — (no specific card) my last defender dies mid-showdown and I get another
 *   unit back in before it ends — do I score?
 *   Exercised with vanilla units, an inline [Reaction] "Deal 9 to a unit." and an inline
 *   [Reaction] "Move a friendly unit to a battlefield."
 *
 * Q: A unit dies during a showdown on the opponent's turn; another unit is moved into that
 *    battlefield during the SAME showdown and wins it. Is that a Conquer worth a point?
 * A: No. Control is frozen while a showdown/combat is ongoing at that battlefield, so you never
 *    lost it — you were defending the whole time, and successfully defending is not a Conquer.
 *    If instead the showdown ENDS first (so the attacker takes the battlefield), coming back later
 *    and beating them there IS a Conquer and does score.
 * Rules: 190.4.b (control does not lapse while a Showdown/Combat is ongoing there), 323.6 (the
 *        control Cleanup runs only in an Open State with nothing ongoing there), 466.5 (Establish
 *        Control after combat: the defender keeps what they had — no Conquer), 469 / 471.2.a.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** [Reaction] "Deal 9 to a unit." */
const BOLT9 = {
  abilities: [{ effect: { amount: 9, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt 9",
  rulesText: "[Reaction] Deal 9 to a unit.",
  timing: "reaction",
} as const;

/** [Reaction] "Move a friendly unit to a battlefield." */
const REDEPLOY = {
  abilities: [
    {
      effect: { target: { controller: "friendly", type: "unit" }, to: "choose", type: "move" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Test Redeploy",
  rulesText: "[Reaction] Move a friendly unit to a battlefield.",
  timing: "reaction",
} as const;

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/**
 * P2's turn. P1 controls bf1, defended by a lone 2-Might Chaff; P1 keeps a 9-Might Reserve in base
 * plus a Redeploy. P2 attacks with a 5-Might Yasuo and holds a Bolt to clear the defender.
 */
const board = () =>
  scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { calm: 2 } })
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Chaff" }, "chaff")
    .unit(P1, "base", { might: 9, name: "Reserve" }, "reserve")
    .unit(P2, "base", { might: 5, name: "Yasuo" }, "yasuo")
    .hand(P1, REDEPLOY, "redeploy")
    .hand(P2, BOLT9, "bolt");

describe("Ruling 82ed7ad7b0468e8e — control is frozen during a showdown, so coming back is defence, not conquest", () => {
  test("when the lone defender dies mid-showdown, control does NOT lapse — the battlefield is still P1's", async () => {
    const game = await board().build();
    await game.p2.move("yasuo", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, isCombatShowdown: true });
    await game.p2.cast("bolt", { targets: "chaff" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("chaff")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual([]); // no P1 unit there at all…
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // …and it is still P1's (190.4.b)
  });

  test("moving another unit in during that same showdown and winning scores NOTHING — it was a defence", async () => {
    const game = await board().build();
    await game.p2.move("yasuo", "bf1");
    await game.p2.cast("bolt", { targets: "chaff" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("chaff")).toBe("trash");
    await game.p1.cast("redeploy", { answers: ["reserve", "bf1"] });
    await game.settle();
    expect(game.locationOf("reserve")).toBe("bf1");
    expect(game.zoneOf("yasuo")).toBe("trash"); // 9 beats 5
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0); // no Conquer: P1 never stopped controlling it
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("if instead the showdown ENDS first, the attacker conquers — and P1 retaking it next turn IS a Conquer that scores", async () => {
    const game = await board().build();
    await game.p2.move("yasuo", "bf1");
    await game.p2.cast("bolt", { targets: "chaff" });
    await game.settle(); // let the combat resolve with P1 having nothing there
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1); // P2's Conquer
    expect(game.p1.points()).toBe(0);

    await game.advanceToTurnOf(P1);
    await game.p1.move("reserve", "bf1");
    await game.settle();
    expect(game.zoneOf("yasuo")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // this time control really did change hands
  });
});
