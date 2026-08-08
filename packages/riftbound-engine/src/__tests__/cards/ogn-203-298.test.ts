/**
 * Possession — ogn-203-298 · Spell · Chaos · 8 energy + [chaos][chaos][chaos] · Action
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Choose an enemy unit at a battlefield. Take control of it and recall it.
 *   (Send it to your base. This isn't a move.)
 *
 * Rules: 455/456 (a Recall relocates a permanent to base without being a Move); control change has
 * no duration here, so it is permanent; only ENEMY units AT A BATTLEFIELD are legal choices.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-203-298";

function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 }) // P1's unit stands where P1 has control — a friendly unit sharing bf1 would (190.3.a) contest it
    .unit(P2, "bf1", { might: 4, name: "Victim" }, "victim")
    .unit(P2, "bf1", { might: 1, name: "Bystander" }, "bystander")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "home")
    .unit(P1, "bf2", { might: 2, name: "Mine" }, "mine")
    .hand(P1, CARD, "pos");
}

describe("Possession (ogn-203-298)", () => {
  test("cost: 8 energy + 3 chaos; spell goes to trash; unaffordable with 2 chaos or 7 energy", async () => {
    const game = await board().build();
    await game.p1.cast("pos", { targets: "victim" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("pos")).toBe("trash");
    const lowPower = await board().resources(P1, { energy: 8, power: { chaos: 2 } }).build();
    expect(lowPower.p1.can("cast", "pos")).toBe(false);
    const lowEnergy = await board().resources(P1, { energy: 7, power: { chaos: 3 } }).build();
    expect(lowEnergy.p1.can("cast", "pos")).toBe(false);
  });

  test("targets: only ENEMY units AT A BATTLEFIELD — not enemy base units, not friendly units", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "pos")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["victim"], ["bystander"]]));
    const t1 = await game.p1.try((p) => p.cast("pos", { targets: "home" }));
    expect(t1.ok).toBe(false);
    const t2 = await game.p1.try((p) => p.cast("pos", { targets: "mine" }));
    expect(t2.ok).toBe(false);
    // No enemy unit at any battlefield → not castable at all.
    const none = await scenario().resources(P1, { energy: 8, power: { chaos: 3 } }).battlefield("bf1").unit(P2, "base", { might: 2 }, "home").unit(P1, "bf1", { might: 2 }, "mine").hand(P1, CARD, "pos").build();
    expect(none.p1.can("cast", "pos")).toBe(false);
  });

  test("take control of it and recall it: the unit ends in YOUR base under your control; others untouched", async () => {
    const game = await board().build();
    await game.p1.cast("pos", { targets: "victim" });
    await game.settle();
    expect(game.state("victim").controller).toBe(P1);
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim").owner).toBe(P2); // ownership never changes (seat.units() is owner-keyed)
    expect(game.state("bystander").controller).toBe(P2);
    expect(game.locationOf("bystander")).toBe("bf1");
    expect(game.state("home").controller).toBe(P2);
  });

  test("control has no duration: the stolen unit is still yours (ready, in base) on your next turn", async () => {
    const game = await board().build();
    await game.p1.cast("pos", { targets: "victim" });
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("victim").controller).toBe(P1);
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim").isReady).toBe(true);
  });

  test("the new controller can Standard-Move the stolen unit", async () => {
    const game = await board().build();
    await game.p1.cast("pos", { targets: "victim" });
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.state("victim")).toMatchObject({ controller: P1, isReady: true, zone: "base" });
    await game.p1.move("victim", "bf1");
    expect(game.locationOf("victim")).toBe("bf1");
  });

  test("Action timing: not castable on the opponent's turn outside a showdown; castable once a showdown is open", async () => {
    const closed = await board().active(P2).build();
    expect(closed.p1.can("cast", "pos")).toBe(false);
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 8, power: { chaos: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5 }, "def")
      .unit(P2, "base", { might: 1 }, "atk")
      .hand(P1, CARD, "pos")
      .build();
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "pos")).toBe(true);
    await game.p1.cast("pos", { targets: "atk" });
    await game.settle();
    expect(game.state("atk").controller).toBe(P1);
    expect(game.zoneOf("atk")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
