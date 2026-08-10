/**
 * Ruling 057a0623009c8191 — (no specific card) chain resolution and priority
 *
 * Q: While a chain resolves, does priority pass between players after EACH item resolves, or does the whole chain resolve
 *    without interaction once everyone has passed?
 * A: After each item resolves, players get priority again and may add to the chain before the next item resolves.
 *    Nuances: if the chain empties completely during a showdown, Focus passes to the next player; you must wait to get
 *    Focus back before playing another Action spell (a new chain).
 * Rules: 340.4 (after an item resolves the newest item's controller gains Priority; back to Execute), 336–339 (LIFO),
 *        346 (empty chain in a showdown ⇒ Focus passes), 340.1 / 355.2.a (Action spells need Focus in a showdown).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** [Action] "Give a unit +2 [Might] this turn." */
const RALLY = {
  abilities: [
    { effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +2 [Might] this turn.",
  timing: "action",
} as const;

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

describe("Ruling 057a0623009c8191 — priority is re-offered after every single chain item resolves", () => {
  test("main phase: A (P1) then B (P2) on the chain; both pass → ONLY B resolves, A is still waiting and both players hold priority again — P1 can add a Reaction C above A", async () => {
    const game = await scenario()
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .hand(P1, RALLY, "a")
      .hand(P1, STING, "c")
      .hand(P2, STING, "b")
      .build();
    await game.p1.cast("a", { targets: "ally" });
    await game.p1.passPriority();
    await game.p2.cast("b", { targets: "ally" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["a", "b"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // all passed in succession → the TOP item (b) resolves — and only it
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.state("ally").damage).toBe(1);
    expect(game.chain().map((i) => i.cardId)).toEqual(["a"]); // A did NOT resolve along with it
    expect(game.state("ally").might).toBe(3);
    // Priority is live again (340.4): the controller of the newest remaining item (P1) acts first and may respond.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "c")).toBe(true);
    await game.p1.cast("c", { targets: "ally" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["a", "c"]);
    // P2 also gets a say before anything else resolves.
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority(); // c resolves
    expect(game.state("ally").damage).toBe(2);
    expect(game.chain().map((i) => i.cardId)).toEqual(["a"]);
    // …and once more both must pass before A finally resolves.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.state("ally").might).toBe(3);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("ally").might).toBe(5);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("showdown nuance: the attacker (Focus) plays an Action spell; when that chain empties Focus PASSES to the defender — the attacker can't start another Action chain until Focus comes back", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P1, RALLY, "r1")
      .hand(P1, RALLY, "r2")
      .hand(P2, RALLY, "p2r")
      .build();
    await game.p1.move("scout", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // attacker holds Focus
    expect(game.p1.can("cast", "r1")).toBe(true);
    await game.p1.cast("r1", { targets: "scout" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // r1 resolves, chain empties → Focus passes (346)
    expect(game.zoneOf("r1")).toBe("trash");
    expect(game.state("scout").might).toBe(4);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 }); // P2 now has Focus + Priority
    expect(game.p1.can("cast", "r2")).toBe(false); // P1 must wait for Focus to start a new Action chain
    expect(game.p2.can("cast", "p2r")).toBe(true);
    await game.p2.passFocus(); // P2 passes Focus back
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "r2")).toBe(true);
  });
});
