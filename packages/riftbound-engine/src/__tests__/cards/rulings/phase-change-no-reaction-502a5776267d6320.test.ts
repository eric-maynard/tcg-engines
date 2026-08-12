/**
 * Ruling 502a5776267d6320 — (no specific card) there is no "end step" window for Reactions.
 *   Exercised with inline [Reaction] "Deal 1 to a unit" and [Action] "Give a unit +2 [Might] this turn" spells.
 *
 * Q: Can a player play a [Reaction] when the opponent proceeds to the end step / changes phases?
 * A: No. Riftbound has no priority pass at a phase change. On an opponent's turn you may only play a
 *    [Reaction] when the chain is NOT empty and you get priority, or in a showdown when you get Focus.
 *    (Unlike Magic, there is no "opponent's end step" window.)
 * Rules: 315–317 (phases run without priority), 336/358.3 (Reaction ⇒ chain + priority), 345–347 (Focus).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** [Reaction] "Deal 1 to a unit." */
const STING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Sting",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

/** [Action] "Give a unit +2 [Might] this turn." */
const RALLY = {
  abilities: [
    {
      effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +2 [Might] this turn.",
  timing: "action",
} as const;

/** P2's turn; P1 waits with a Reaction. P2 has a unit to target and an Action of their own. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .unit(P2, "base", { might: 4, name: "Grunt" }, "grunt")
    .hand(P1, STING, "sting")
    .hand(P2, RALLY, "rally");
}

describe("Ruling 502a5776267d6320 — no Reaction window at a phase change / end of turn", () => {
  test("during the opponent's main phase with an empty chain, P1's [Reaction] is simply not playable", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("cast", "sting")).toBe(false);
    const denied = await game.p1.try((p) => p.cast("sting", { targets: "grunt" }));
    expect(denied.ok).toBe(false);
    expect(game.zoneOf("sting")).toBe("hand");
  });

  test("P2 ending the turn hands P1 no window: the Ending Step and the phase change run through to P1's own turn", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    expect(game.turnPlayer()).toBe(P1); // the position that comes back is already P1's turn
    expect(game.phase()).toBe("main");
    expect(game.state("grunt").damage).toBe(0); // the Reaction never got to fire on P2's turn
    // On P1's own turn the [Reaction] is playable (a Reaction may always be played when you could
    // play a card) — proving the earlier refusals were about the missing window, not about the card.
    expect(game.p1.can("cast", "sting")).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("the two windows that DO exist on the opponent's turn: priority on a live chain…", async () => {
    const game = await board().build();
    await game.p2.cast("rally", { targets: "grunt" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["rally"]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "sting")).toBe(true);
  });

  test("…and Focus in a showdown", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 4, name: "Grunt" }, "grunt")
      .hand(P1, STING, "sting")
      .build();
    expect(game.p1.can("cast", "sting")).toBe(false);
    await game.p2.move("grunt", "bf1"); // combat showdown; P2 (attacker) has Focus first
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "sting")).toBe(true);
  });
});
