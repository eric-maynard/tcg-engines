/**
 * Ruling 814b9b9911db922b — (no specific card) a Reaction kills a unit mid-showdown: what happens
 *   to the chain and to the showdown?
 *   Exercised with vanilla units, an inline [Reaction] "Deal 9 to a unit." and an inline
 *   [Action] "Give a unit +1 [Might] this turn."
 *
 * Q: If a reaction spell kills a unit during a combat showdown, does the chain end or continue,
 *    and can players still pass focus after the unit dies?
 * A: The killer resolves, the unit hits the trash immediately, and the rest of the chain resolves
 *    normally — nothing is cut short. Afterwards Focus keeps passing back and forth; the showdown
 *    ends only when both players pass without starting a new chain. One side having no units left
 *    at the battlefield ends neither the chain nor the showdown. You cannot "pass in between" the
 *    kill and the death — the unit dies as that spell resolves.
 * Rules: 336–340 (each chain item resolves in turn; a resolution is not interruptible), 321/318
 *        (the Cleanup after each resolution is where lethal damage kills), 347.2 (the showdown
 *        closes only on a full round of Passes), 466 (combat resolution comes after that).
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

/** [Action] "Give a unit +1 [Might] this turn." */
const RALLY = {
  abilities: [
    {
      effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +1 [Might] this turn.",
  timing: "action",
} as const;

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/**
 * P1's turn. P1 attacks bf1 with two units; P2 defends with a lone 3-Might Sentry and holds the
 * Bolt. P1 also holds a Rally so a second item can sit UNDER the killing reaction on the chain.
 */
const board = () =>
  scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Sentry" }, "sentry")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .unit(P1, "base", { might: 2, name: "Skirmisher" }, "skirmisher")
    .hand(P1, RALLY, "rally")
    .hand(P2, BOLT9, "bolt");

describe("Ruling 814b9b9911db922b — killing a unit mid-showdown cuts off neither the chain nor the showdown", () => {
  test("the reaction resolves, the unit is in the trash at once, and the item UNDER it still resolves normally", async () => {
    const game = await board().build();
    await game.p1.move(["raider", "skirmisher"], "bf1");
    await game.p1.cast("rally", { targets: "raider" }); // bottom of the chain
    await game.p1.passPriority();
    await game.p2.cast("bolt", { targets: "skirmisher" }); // top of the chain
    expect(game.chain().map((i) => i.cardId)).toEqual(["rally", "bolt"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    // Bolt resolved: the Skirmisher is dead immediately, with no window before the death.
    expect(game.zoneOf("skirmisher")).toBe("trash");
    // …and the chain is intact underneath.
    expect(game.chain().map((i) => i.cardId)).toEqual(["rally"]);
    expect(game.state("raider").might).toBe(4); // Rally has not resolved yet
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("raider").might).toBe(5); // it resolved normally after the death
  });

  test("the showdown is still open after the death and Focus keeps passing", async () => {
    const game = await board().build();
    await game.p1.move(["raider", "skirmisher"], "bf1");
    await game.p1.passFocus();
    await game.p2.cast("bolt", { targets: "skirmisher" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("skirmisher")).toBe("trash");
    expect(showdown(game)).toMatchObject({ active: true, isCombatShowdown: true });
    // a play instead of a Pass resets the sequence, so nobody has "passed out" of it yet
    expect(showdown(game)?.passedPlayers).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("killing the LAST defender does not end the showdown either — it closes only on a full round of Passes", async () => {
    const game = await board().build();
    await game.p1.move(["raider", "skirmisher"], "bf1");
    await game.p1.passFocus();
    await game.p2.cast("bolt", { targets: "raider" }); // P2 kills an attacker instead
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(showdown(game)?.active).toBe(true);
    expect(game.p1.units("bf1")).toEqual(["skirmisher"]); // P1 still has a unit there
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(showdown(game)?.active).toBeFalsy();
    await game.settle();
    // combat then resolves as normal: 2 Might vs the 3-Might Sentry — the defender holds
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
