/**
 * Ruling 996d21b903161988 — (no specific card) "When I attack" and empty battlefields.
 *
 * Q: Do "When I attack" triggers fire when a unit moves into an EMPTY battlefield?
 * A: No. "When I attack" needs the Attacker designation, and that is only stamped when Combat opens —
 *    i.e. when opposing units are present. Walking into an unoccupied battlefield opens a Non-Combat
 *    Showdown, nobody is designated, and the trigger never becomes pending.
 * Rules: 464.2 / 464.2.c.3 (designations are stamped when Combat opens), 807.1.d (being an attacker =
 *        having gained the Attacker designation during Combat), 344.2 (a showdown also opens with no
 *        opposing units — it is simply not a combat).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** "When I attack, draw 1." */
const HERALD = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "attack", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 4,
  name: "Test Herald",
  rulesText: "When I attack, draw 1.",
} as const;

/** bf1 is empty and uncontrolled; bf2 is held by P2 with a unit on it. */
function board() {
  return scenario()
    .battlefield("bf1")
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", HERALD, "herald");
}

describe("Ruling 996d21b903161988 — moving into an empty battlefield is a showdown, not a combat, so 'when I attack' never fires", () => {
  test("into the EMPTY bf1: no attacker designation, no chain item, no draw — but the showdown does happen and P1 conquers", async () => {
    const game = await board().build();
    const before = game.p1.hand().length;
    await game.p1.move("herald", "bf1");
    expect(game.chain()).toEqual([]); // the trigger never became pending
    expect(game.state("herald").combatRole).not.toBe("attacker");
    expect(game.p1.hand().length).toBe(before);
    await game.settle();
    expect(game.p1.hand().length).toBe(before); // still nothing drawn
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("into the OCCUPIED enemy bf2: combat opens, the herald is the Attacker and the trigger fires", async () => {
    const game = await board().build();
    const before = game.p1.hand().length;
    await game.p1.move("herald", "bf2");
    expect(game.state("herald").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "herald", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.p1.hand().length).toBe(before + 1);
    expect(game.violations()).toEqual([]);
  });

  test("the trigger is not merely deferred: after the empty-battlefield showdown closes, it still has not fired", async () => {
    const game = await board().build();
    const before = game.p1.hand().length;
    await game.p1.move("herald", "bf1");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand().length).toBe(before);
    expect(game.locationOf("herald")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });
});
