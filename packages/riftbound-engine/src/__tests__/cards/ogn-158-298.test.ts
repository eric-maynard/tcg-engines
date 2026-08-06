/**
 * Volibear, Imposing — ogn-158-298 · Champion Unit (Volibear) · Body · 12 energy + [body][body] · 10 Might
 *
 *   [Shield 3] (+3 [Might] while I'm a defender.)
 *   [Tank] (I must be assigned combat damage first.)
 *   When an opponent moves to a battlefield other than mine, draw 1. (Bases are not battlefield.)
 *
 * Rules: 814 (Shield: +X Might while a defender), 815 (Tank: must be assigned lethal damage first),
 * 142.4 (lethal = damage ≥ Might), triggered ability on an opponent's Move game action.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-158-298";

/** P2's turn. Volibear sits at bf1 (P1); bf2 is open; P2 has a mover in base. */
function board(moverMight = 2) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", CARD, "voli")
    .unit(P2, "base", { might: moverMight, name: "Mover" }, "mover");
}

describe("Volibear, Imposing (ogn-158-298)", () => {
  test("cost: 12 energy + 2 body deducted; 10 Might with Shield and Tank; unaffordable with 1 body or 11 energy", async () => {
    const game = await scenario().resources(P1, { energy: 12, power: { body: 2 } }).hand(P1, CARD, "voli").build();
    await game.p1.play("voli");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("voli")).toBe("base");
    expect(game.state("voli").might).toBe(10);
    expect(game.state("voli").keywords).toEqual(expect.arrayContaining(["Shield", "Tank"]));
    const oneBody = await scenario().resources(P1, { energy: 12, power: { body: 1 } }).hand(P1, CARD, "voli").build();
    expect(oneBody.p1.can("play", "voli")).toBe(false);
    const low = await scenario().resources(P1, { energy: 11, power: { body: 2 } }).hand(P1, CARD, "voli").build();
    expect(low.p1.can("play", "voli")).toBe(false);
  });

  test("Shield 3: defending alone he is 13 Might — a 12-Might attacker fails to kill him and P1 keeps bf1", async () => {
    const game = await board(12).build();
    await game.p2.move("mover", "bf1");
    await game.settle();
    expect(game.locationOf("voli")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // Control: 13 Might of attack is lethal even through Shield 3.
    const ctl = await board(13).build();
    await ctl.p2.move("mover", "bf1");
    await ctl.settle();
    expect(ctl.zoneOf("voli")).toBe("trash");
  });

  test("Shield does not apply while attacking: 10 Might into a 10-Might defender trades", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "voli")
      .unit(P2, "bf1", { might: 10 }, "wall")
      .build();
    await game.p1.move("voli", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("voli")).toBe("trash");
  });

  test("Tank: a 5-Might attacker must assign its damage to Volibear first, so the 1-Might ally beside him survives", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1 }, "ally")
      .unit(P1, "bf1", CARD, "voli")
      .unit(P2, "base", { might: 5 }, "atk")
      .build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.locationOf("voli")).toBe("bf1");
    expect(game.zoneOf("atk")).toBe("trash");
  });

  test("an opponent moving to a battlefield OTHER than Volibear's → P1 draws 1 (and not when moving to his own)", async () => {
    // Expected: P2's move into the open bf2 triggers Volibear and P1 draws 1; a move into bf1 does not.
    // Actual: the parsed trigger event "move-to-battlefield" is not in the trigger matcher's event
    // map, so the ability never fires and P1 draws nothing.
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    await game.p2.move("mover", "bf2");
    await game.settle();
    expect(game.locationOf("mover")).toBe("bf2");
    expect(game.p1.hand().length).toBe(1);
    expect(game.p2.hand().length).toBe(p2Hand); // the mover's controller draws nothing
    const own = await board().build();
    await own.p2.move("mover", "bf1");
    await own.settle();
    expect(own.p1.hand().length).toBe(0);
  });

  test("an opponent moving to Volibear's OWN battlefield draws nothing ('other than mine')", async () => {
    const game = await board().build();
    const before = game.p1.hand().length;
    await game.p2.move("mover", "bf1");
    await game.settle();
    expect(game.p1.hand().length).toBe(before);
  });

  test("an opponent moving back to BASE draws nothing (bases are not battlefields)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "voli")
      .unit(P2, "bf2", { might: 2 }, "mover")
      .build();
    const before = game.p1.hand().length;
    await game.p2.move("mover", "base");
    await game.settle();
    expect(game.locationOf("mover")).toBe("base");
    expect(game.p1.hand().length).toBe(before);
  });

  test("'an opponent': P1's own move to another battlefield draws nothing", async () => {
    const game = await board().active(P1).unit(P1, "base", { might: 2 }, "mine").build();
    const before = game.p1.hand().length;
    await game.p1.move("mine", "bf2");
    await game.settle();
    expect(game.p1.hand().length).toBe(before);
  });
});
