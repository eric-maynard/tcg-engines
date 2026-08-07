/**
 * Minotaur Reckoner — sfd-014-221 · Unit · Fury · 5 energy · 5 might
 *
 *   Units can't move to base.
 *
 * Rules: 144.4.b (a unit's Standard Move may go battlefield → base), 455 (a
 * Recall relocates a permanent to base WITHOUT being a Move — so combat recalls
 * are unaffected), 423.1.b (a stunned unit deals no combat damage). "Units" is
 * unscoped so it binds both players' units.
 *
 * Engine status: the static grants a `NoMoveToBase` marker keyword that no move condition or move
 * effect consults yet — the restriction is not enforced (BUG tests).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-014-221";
const EMPERORS_DIVIDE = "sfd-043-221"; // Action spell: move any number of friendly units at a battlefield to base.

function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", CARD, "reckoner")
    .unit(P1, "bf1", { might: 2 }, "mine")
    .unit(P1, "bf1", { might: 1 }, "holder")
    .unit(P2, "bf2", { might: 2 }, "theirs")
    .unit(P2, "bf2", { might: 1 }, "theirHolder");
}

describe("Minotaur Reckoner (sfd-014-221)", () => {
  test("cost: 5 energy for a 5-might unit that enters the base exhausted; 4 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "reckoner").build();
    await game.p1.play("reckoner");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("reckoner")).toBe("base");
    expect(game.state("reckoner").might).toBe(5);
    expect(game.state("reckoner").isExhausted).toBe(true);
    const poor = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "reckoner").build();
    expect(poor.p1.can("play", "reckoner")).toBe(false);
  });

  test("baseline: without Reckoner in play a unit at a battlefield may Standard-Move back to base (144.4.b)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "mine")
      .unit(P1, "bf1", { might: 1 }, "holder")
      .build();
    await game.p1.move("mine", "base");
    expect(game.locationOf("mine")).toBe("base");
  });

  test("your own units at a battlefield cannot move to base while Reckoner is in play", async () => {
    const game = await board().build();
    const r = await game.p1.try((p) => p.move("mine", "base"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("mine")).toBe("bf1");
  });

  test("enemy units are bound too ('Units' is unscoped): the opponent cannot move to base on their turn", async () => {
    const game = await board().active(P2).build();
    const r = await game.p2.try((p) => p.move("theirs", "base"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("theirs")).toBe("bf2");
  });

  test("moving TO a battlefield is still allowed (only the base destination is forbidden)", async () => {
    const game = await board().unit(P1, "base", { might: 3 }, "walker").build();
    await game.p1.move("walker", "bf1");
    expect(game.locationOf("walker")).toBe("bf1");
  });

  test("effect-driven moves to base are also forbidden: Emperor's Divide cannot move a unit home", async () => {
    const game = await board().resources(P1, { energy: 2 }).hand(P1, EMPERORS_DIVIDE, "divide").build();
    if (game.p1.can("cast", "divide")) {
      const r = await game.p1.try((p) => p.cast("divide", { targets: ["mine"] }));
      if (r.ok) {
        await game.settle({ policy: "first" });
      }
    }
    expect(game.locationOf("mine")).toBe("bf1");
  });

  test("a combat Recall is not a Move (455): an attacker that survives against a surviving (stunned) defender is still sent to base", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "reckoner")
      .unit(P1, "base", { might: 2 }, "poker")
      .unit(P2, "bf1", { might: 5 }, "wall", { stunned: true })
      .build();
    await game.p1.move("poker", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.state("wall").damage).toBe(0); // healed in combat cleanup
    expect(game.zoneOf("poker")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test.failing("BUG: once Reckoner leaves play the restriction ends", async () => {
    const game = await board().build();
    expect((await game.p1.try((p) => p.move("mine", "base"))).ok).toBe(false);
    await game.p1.do("killUnit", { cardId: "reckoner" });
    expect(game.zoneOf("reckoner")).toBe("trash");
    await game.p1.move("mine", "base");
    expect(game.locationOf("mine")).toBe("base");
  });
});
