/**
 * Ruling 3680bbeed0235f76 — (no specific card) more than one chain inside a single showdown.
 *
 * Q: After I play Reactions to buff a card during a showdown, can my opponent play an Action when
 *    priority passes back to them?
 * A: Yes. When your chain resolves and empties, Focus moves to the opponent, who may start a NEW chain
 *    with an Action. A showdown ends only when all players pass in succession WITHOUT starting a chain,
 *    so several chains can happen inside one showdown.
 * Rules: 346 (empty chain in a showdown ⇒ Focus passes), 347 / 355.2.a (Actions need Focus), 348 (the
 *        showdown closes on consecutive passes with no chain started), 340 (priority within a chain).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** [Reaction] "Give a unit +2 [Might] this turn." */
const GUARD_UP = {
  abilities: [
    { effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Guard Up",
  rulesText: "[Reaction] Give a unit +2 [Might] this turn.",
  timing: "reaction",
} as const;

/** [Action] "Give a unit +2 [Might] this turn." */
const RALLY = {
  ...GUARD_UP,
  abilities: [
    { effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" },
  ],
  name: "Test Rally",
  rulesText: "[Action] Give a unit +2 [Might] this turn.",
  timing: "action",
} as const;

const board = () =>
  scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, GUARD_UP, "buff1")
    .hand(P1, RALLY, "mineAction")
    .hand(P2, RALLY, "theirAction");

describe("Ruling 3680bbeed0235f76 — a showdown can hold several chains: the opponent may start an Action chain after yours resolves", () => {
  test("attacker's Reaction resolves → Focus is the defender's → the defender starts a NEW chain with an Action", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("buff1", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // buff resolves, chain empties
    expect(game.state("raider").might).toBe(5);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.cast("theirAction", { targets: "guard" }); // a second chain inside the same showdown
    expect(game.chain().map((i) => i.cardId)).toEqual(["theirAction"]);
    expect(game.p1.can("cast", "mineAction")).toBe(false); // still not P1's Focus; only Reactions respond
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("guard").might).toBe(5);
    expect(game.violations()).toEqual([]);
  });

  test("the showdown is still open after both chains: Focus returns to the attacker, who may start a THIRD chain", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("buff1", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p2.cast("theirAction", { targets: "guard" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "mineAction")).toBe(true);
    expect(game.zoneOf("raider")).toBe("battlefield-bf1"); // no combat damage yet — the showdown has not ended
  });

  test("only two passes in SUCCESSION with no chain started end it: 5 vs 5 then trade", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("buff1", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p2.cast("theirAction", { targets: "guard" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
  });
});
