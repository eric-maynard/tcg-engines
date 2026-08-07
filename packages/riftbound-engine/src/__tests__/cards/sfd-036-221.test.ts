/**
 * Lonely Poro — sfd-036-221 · Unit · Calm · 2 energy · 2 might · Poro
 *
 *   [Deathknell] — If I died alone, draw 1. (When I die, get the effect. I'm alone if there are
 *   no other friendly units here.)
 *
 * Rules: 808 Deathknell (323.4 / 428.1.a.1.b: note the unit's location as it dies), 740.2.a (a unit
 * is alone when there are no other FRIENDLY units at the same location — enemies don't matter).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-036-221";
const FINAL_SPARK = "ogs-022-024"; // 8 energy: Deal 8 to a unit.

/** P2's turn with a Final Spark aimed at the Poro on bf1. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 8 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", CARD, "poro")
    .hand(P2, FINAL_SPARK, "spark");
}

describe("Lonely Poro (sfd-036-221)", () => {
  test("cost: 2 energy, no power; a 2-might unit with Deathknell; unaffordable with 1", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "poro").build();
    await game.p1.play("poro");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.state("poro").might).toBe(2);
    expect(game.state("poro").keywords).toContain("Deathknell");
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "poro").build();
    expect(poor.p1.can("play", "poro")).toBe(false);
  });

  test("dies alone (no other friendly unit here) → Deathknell on the chain → its controller draws 1", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    const p2Hand0 = game.p2.hand().length;
    await game.p2.cast("spark", { targets: "poro" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.p2.hand()).toHaveLength(p2Hand0 - 1); // the killer draws nothing
  });

  test("enemy units here don't stop it being alone (740.2.a): still draws 1", async () => {
    const game = await board().unit(P2, "bf1", { might: 1, name: "Enemy" }, "enemy").build();
    const hand0 = game.p1.hand().length;
    await game.p2.cast("spark", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test("a friendly unit at a DIFFERENT location doesn't matter: still alone here, still draws 1", async () => {
    const game = await board().unit(P1, "bf2", { might: 1, name: "Elsewhere" }, "elsewhere").unit(P1, "base", { might: 1 }, "home").build();
    const hand0 = game.p1.hand().length;
    await game.p2.cast("spark", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test("'If I died alone' — with another friendly unit at the same battlefield the Deathknell must draw nothing (740.2.a, 428.1.a.1.b)", async () => {
    // Expected: Buddy shares bf1 with the Poro when it dies, so it did not die alone → no draw.
    // Actual: the alone condition is not evaluated against the death location (the Poro is already
    // in the trash / the condition is ignored), so P1 draws 1 anyway.
    const game = await board().unit(P1, "bf1", { might: 1, name: "Buddy" }, "buddy").build();
    const hand0 = game.p1.hand().length;
    await game.p2.cast("spark", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.locationOf("buddy")).toBe("bf1");
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("dying alone in combat also draws 1 (323.4)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "poro")
      .unit(P2, "base", { might: 4, name: "Attacker" }, "atk")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });
});
