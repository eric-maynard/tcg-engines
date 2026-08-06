/**
 * Super Mega Death Rocket! — ogn-252-298 · Spell · Fury/Chaos · 4 energy + [rainbow]
 *
 *   Deal 5 to a unit.
 *   When you conquer, you may discard 1 to return this from your trash to your hand.
 *
 * Rule 385.2: the second ability is a triggered ability that is active while
 * the card is in the trash (and nowhere else). Engine note: a [rainbow] pip
 * is paid from `power.rainbow` today.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-252-298";
const FILLER = "ogn-175-298";

function castBoard() {
  return scenario()
    .resources(P1, { energy: 4, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Five" }, "five")
    .unit(P2, "base", { might: 6, name: "Six" }, "six")
    .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
    .hand(P1, CARD, "rocket");
}

/** Rocket in P1's trash, a card in hand to discard, and a unit ready to walk into P2's empty bf1. */
function conquerBoard() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .trash(P1, CARD, "rocket")
    .hand(P1, FILLER, "junk");
}

describe("Super Mega Death Rocket! (ogn-252-298)", () => {
  test("deals 5 to the chosen unit: a 5-Might unit dies; pays 4 energy + 1 rainbow; spell to trash", async () => {
    const game = await castBoard().build();
    await game.p1.cast("rocket", { targets: "five" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.zoneOf("five")).toBe("trash");
    expect(game.zoneOf("rocket")).toBe("trash");
  });

  test("'a unit': any unit anywhere — a 6-Might unit in a base survives with 5 damage; your own unit is targetable", async () => {
    const game = await castBoard().build();
    const offered = game.p1.option("cast", "rocket")?.fields.find((f) => f.arg === "targets")?.options;
    expect(offered).toEqual(expect.arrayContaining([["five"], ["six"], ["mine"]]));
    await game.p1.cast("rocket", { targets: "six" });
    await game.settle();
    expect(game.zoneOf("six")).toBe("base");
    expect(game.state("six").damage).toBe(5);
  });

  test("cost: unaffordable without the rainbow power or with 3 energy", async () => {
    const noPow = await scenario().resources(P1, { energy: 4 }).unit(P2, "base", { might: 1 }, "u").hand(P1, CARD, "rocket").build();
    expect(noPow.p1.can("cast", "rocket")).toBe(false);
    const low = await scenario().resources(P1, { energy: 3, power: { rainbow: 1 } }).unit(P2, "base", { might: 1 }, "u").hand(P1, CARD, "rocket").build();
    expect(low.p1.can("cast", "rocket")).toBe(false);
  });

  test.failing("BUG: when you conquer with this in your trash, you may discard 1 to return it to your hand (rule 385.2)", async () => {
    // Expected: Runner conquers empty bf1 → trigger from trash → P1 says yes, discards junk →
    // rocket in hand, junk in trash. Actual: abilities of cards in the trash never trigger.
    const game = await conquerBoard().script(P1, ["junk"]).build();
    await game.p1.move("runner", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("rocket")).toBe("hand");
    expect(game.zoneOf("junk")).toBe("trash");
  });

  test.failing("BUG: 'you may' — declining leaves the rocket in the trash and the hand intact", async () => {
    // Expected: a yes/no prompt that can be declined. Actual: no prompt at all (trigger missing).
    const game = await conquerBoard().build();
    await game.p1.move("runner", "bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("rocket")).toBe("trash");
    expect(game.zoneOf("junk")).toBe("hand");
  });

  test("with no card to discard the cost can't be paid: the rocket stays in the trash", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", { might: 3 }, "runner").trash(P1, CARD, "rocket").build();
    await game.p1.move("runner", "bf1");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("rocket")).toBe("trash");
  });

  test("only from the trash: conquering while the rocket is in HAND triggers nothing", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", { might: 3 }, "runner").hand(P1, CARD, "rocket").hand(P1, FILLER, "junk").build();
    await game.p1.move("runner", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("rocket")).toBe("hand");
    expect(game.zoneOf("junk")).toBe("hand");
  });

  test("only when YOU conquer: the opponent conquering does not offer you the return", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P2, "base", { might: 3 }, "raider")
      .trash(P1, CARD, "rocket")
      .hand(P1, FILLER, "junk")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.decision()?.seat).toBe(P2);
    expect(game.zoneOf("rocket")).toBe("trash");
    expect(game.zoneOf("junk")).toBe("hand");
  });
});
