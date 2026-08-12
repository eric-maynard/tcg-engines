/**
 * Ruling 3c0f819301a42925 — (no specific card) reacting to a standard move onto an empty battlefield.
 *   Exercised with Ride the Wind (OGN-173 → ogn-173-298) "[Action] Move a friendly unit and ready it."
 *   and an inline unit whose move triggers an ability.
 *
 * Q: Can a Reaction be played against a unit moving to an empty battlefield?
 * A: No. A standard move is not an ability and opens no chain, so there is no window to react to the
 *    move itself. Exceptions: a move performed by a spell/activated ability puts THAT on the chain
 *    and it can be answered, and any ability that triggers off the move opens a chain you may answer.
 * Rules: 143 (standard move is a game action), 336/358.3 (Reactions need a chain + priority),
 *        344.2 (the showdown is staged in the following Cleanup).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/** [Reaction] "Deal 1 to a unit." — P2's would-be answer. */
const STING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Sting",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

/** A unit that draws a card the first time it moves — a move TRIGGER, unlike the move itself. */
const SCOUTMASTER = {
  abilities: [
    {
      effect: { amount: 1, type: "draw" },
      trigger: { event: "move", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  might: 2,
  name: "Test Scoutmaster",
  rulesText: "When I move, draw 1.",
} as const;

describe("Ruling 3c0f819301a42925 — a standard move onto an empty battlefield opens no chain, so it cannot be reacted to", () => {
  test("P1 walks a unit onto an empty, uncontrolled battlefield: no chain, and P2 is never offered a window to Reaction it", async () => {
    const game = await scenario()
      .battlefield("bf1")
      .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
      .hand(P2, STING, "sting")
      .build();
    expect(game.p2.can("cast", "sting")).toBe(false); // nothing to respond to yet
    await game.p1.move("scout", "bf1");
    // The move itself produced no chain item at all.
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("scout")).toBe("bf1");
    // The showdown is staged immediately and P1 (who applied Contested) holds it — P2 got no priority.
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
    expect(game.p2.can("cast", "sting")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("exception: the same move performed by a SPELL puts the spell on the chain and P2 may Reaction it before it resolves", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1")
      .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
      .hand(P1, RIDE_THE_WIND, "ride")
      .hand(P2, STING, "sting")
      .build();
    await game.p1.cast("ride", { targets: "scout", answers: ["bf1"] });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ride"]);
    expect(game.locationOf("scout")).toBe("base"); // has not moved yet — the spell is unresolved
    await game.p1.passPriority();
    expect(game.p2.can("cast", "sting")).toBe(true); // THIS is reactable
    await game.p2.cast("sting", { targets: "scout" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ride", "sting"]);
    await game.settle();
    expect(game.state("scout").damage).toBe(1);
    expect(game.locationOf("scout")).toBe("bf1");
  });

  test("exception: a standard move that TRIGGERS an ability opens a chain — P2 may answer the trigger (but still not the move)", async () => {
    const game = await scenario()
      .battlefield("bf1")
      .unit(P1, "base", SCOUTMASTER, "scout")
      .hand(P2, STING, "sting")
      .build();
    await game.p1.move("scout", "bf1");
    expect(game.chain().map((i) => i.cardId)).toEqual(["scout"]); // the move trigger, not the move
    expect(game.locationOf("scout")).toBe("bf1"); // the move itself already happened
    await game.p1.passPriority();
    expect(game.p2.can("cast", "sting")).toBe(true);
    await game.p2.cast("sting", { targets: "scout" });
    await game.settle();
    expect(game.state("scout").damage).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
