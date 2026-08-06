/**
 * Warwick, Hunter — ogn-159-298 · Champion Unit · Body · 6 energy + [body] · 5 Might
 *
 *   I enter ready.
 *   When I attack, kill all damaged enemy units here.
 *
 * Rule 359.2.c: units enter exhausted by default — Warwick replaces that.
 * Rule 383.4.e: "When I attack" triggers as Warwick becomes an attacker in a
 * combat; it resolves on the chain before combat damage is dealt.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-159-298";

/** Warwick (5) in base; at P2's bf1: an 8-might unit with 1 damage and a healthy 3-might unit. */
function huntBoard() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", CARD, "ww")
    .unit(P2, "bf1", { might: 8, name: "Wounded Giant" }, "wounded", { damage: 1 })
    .unit(P2, "bf1", { might: 3, name: "Healthy" }, "healthy")
    .unit(P2, "base", { might: 2, name: "Hurt at home" }, "home", { damage: 1 });
}

describe("Warwick, Hunter (ogn-159-298)", () => {
  test("enters the board READY when played (6 energy + 1 body, 5 Might)", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { body: 1 } }).hand(P1, CARD, "ww").build();
    await game.p1.play("ww");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("ww")).toBe("base");
    expect(game.state("ww").isReady).toBe(true);
    expect(game.state("ww").might).toBe(5);
  });

  test("cost: unaffordable with 5 energy or without body power", async () => {
    const low = await scenario().resources(P1, { energy: 5, power: { body: 1 } }).hand(P1, CARD, "ww").build();
    expect(low.p1.can("play", "ww")).toBe(false);
    const noBody = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "ww").build();
    expect(noBody.p1.can("play", "ww")).toBe(false);
  });

  test("attack trigger goes on the chain when Warwick attacks", async () => {
    const game = await huntBoard().build();
    await game.p1.move("ww", "bf1");
    expect(game.state("ww").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ww", controller: P1, triggered: true })]);
  });

  test("when I attack: every DAMAGED enemy unit here is killed before combat damage; undamaged ones are not", async () => {
    const game = await huntBoard().build();
    await game.p1.move("ww", "bf1");
    await game.settle();
    // Trigger killed the wounded 8-might giant; combat: Warwick 5 vs Healthy 3 → Healthy dies,
    // Warwick takes only 3 and survives to conquer. (Without the trigger Warwick would take 11 and die.)
    expect(game.zoneOf("wounded")).toBe("trash");
    expect(game.zoneOf("healthy")).toBe("trash");
    expect(game.locationOf("ww")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("'here' only: a damaged enemy unit at another location is untouched", async () => {
    const game = await huntBoard().build();
    await game.p1.move("ww", "bf1");
    await game.settle();
    expect(game.zoneOf("home")).toBe("base");
    expect(game.state("home").damage).toBe(1);
  });

  test("'enemy' only: a damaged friendly unit attacking alongside Warwick is not killed", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "ww")
      .unit(P1, "base", { might: 4, name: "Scarred Ally" }, "ally", { damage: 1 })
      .unit(P2, "bf1", { might: 1, name: "Chump" }, "chump")
      .build();
    await game.p1.move(["ww", "ally"], "bf1");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("chump")).toBe("trash");
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.locationOf("ww")).toBe("bf1");
  });

  test("only when *I* attack: Warwick defending does not kill damaged attackers", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ww")
      .unit(P2, "base", { might: 2, name: "Scratched Raider" }, "raider", { damage: 1 })
      .unit(P2, "base", { might: 9, name: "Big Raider" }, "big")
      .build();
    await game.p2.move(["raider", "big"], "bf1");
    expect(game.chain()).toHaveLength(0); // no Warwick trigger
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
  });
});
