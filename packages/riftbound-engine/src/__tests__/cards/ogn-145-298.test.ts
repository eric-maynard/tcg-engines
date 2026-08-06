/**
 * Unyielding Spirit — ogn-145-298 · Spell · Body · 1 energy + [body]
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Prevent all spell and ability damage this turn.
 *
 * Rules: 437 (Prevent reduces damage that would be dealt; it is a replacement effect, 369.2),
 * Reaction timing (may be played with priority on any turn / in response on a chain), combat
 * damage is neither spell nor ability damage.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-145-298";
const INCINERATE = "ogs-003-024"; // Action spell: deal 2 to a unit at a battlefield
const BALLISTA = "ogn-017-298"; // Gear — [Exhaust]: deal 2 to a unit at a battlefield (ability #1)

/** P2's turn; P1 holds Unyielding Spirit with a 3-Might unit at bf1. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 1, power: { body: 1 } })
    .resources(P2, { energy: 4 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Target" }, "target")
    .hand(P1, CARD, "us");
}

describe("Unyielding Spirit (ogn-145-298)", () => {
  test("cost: 1 energy + 1 body, spell goes to trash; unaffordable without the body power or with 0 energy", async () => {
    const game = await board().active(P1).build();
    await game.p1.cast("us");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("us")).toBe("trash");
    const noBody = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "us").build();
    expect(noBody.p1.can("cast", "us")).toBe(false);
    const noEnergy = await scenario().resources(P1, { power: { body: 1 } }).hand(P1, CARD, "us").build();
    expect(noEnergy.p1.can("cast", "us")).toBe(false);
  });

  test("Reaction: castable on the opponent's turn in response to their spell, and it resolves first", async () => {
    const game = await board().hand(P2, INCINERATE, "burn").build();
    await game.p2.cast("burn", { targets: "target" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "us")).toBe(true);
    await game.p1.cast("us");
    expect(game.chain().map((i) => i.cardId)).toEqual(["burn", "us"]);
    await game.settle();
    // Spell damage prevented: the 3-Might unit takes nothing from Incinerate's 2.
    expect(game.state("target").damage).toBe(0);
    expect(game.locationOf("target")).toBe("bf1");
    expect(game.zoneOf("us")).toBe("trash");
    expect(game.zoneOf("burn")).toBe("trash");
  });

  test("prevents spell damage dealt later in the same turn (cast pre-emptively, resolved first)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "target")
      .hand(P1, CARD, "us")
      .hand(P1, INCINERATE, "burn")
      .build();
    await game.p1.cast("us");
    await game.settle();
    expect(game.zoneOf("us")).toBe("trash");
    await game.p1.cast("burn", { targets: "target" });
    await game.settle();
    expect(game.zoneOf("burn")).toBe("trash");
    expect(game.state("target").damage).toBe(0);
  });

  test("prevents ABILITY damage too (Iron Ballista's [Exhaust]: deal 2)", async () => {
    const game = await board().gear(P2, BALLISTA, "ib").build();
    await game.p2.activate("ib", 1, { targets: "target" });
    await game.p2.passPriority();
    await game.p1.cast("us");
    await game.settle();
    expect(game.state("target").damage).toBe(0);
    expect(game.state("ib").isExhausted).toBe(true);
  });

  test("does NOT prevent combat damage: a 3-Might attacker still trades with the 3-Might unit", async () => {
    const same = await scenario()
      .resources(P1, { energy: 1, power: { body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3 }, "def")
      .unit(P1, "base", { might: 3 }, "mine")
      .hand(P1, CARD, "us")
      .build();
    await same.p1.cast("us");
    await same.settle();
    await same.p1.move("mine", "bf1");
    await same.settle();
    expect(same.zoneOf("mine")).toBe("trash");
    expect(same.zoneOf("def")).toBe("trash");
  });

  test("'this turn' only: next turn spell damage is dealt normally", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { body: 1 } })
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "target")
      .hand(P1, CARD, "us")
      .hand(P2, INCINERATE, "burn")
      .build();
    await game.p1.cast("us");
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 2 });
    await game.p2.cast("burn", { targets: "target" });
    await game.settle();
    expect(game.state("target").damage).toBe(2);
  });
});
