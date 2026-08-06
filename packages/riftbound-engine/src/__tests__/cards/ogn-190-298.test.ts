/**
 * Kog'Maw, Caustic — ogn-190-298 · Champion Unit (Kog'Maw) · Chaos · 3 energy + [chaos] · 1 Might
 *
 *   [Deathknell] — Deal 4 to all units at my battlefield. (When I die, get the effect.)
 *
 * Rules: 808 (Deathknell), 428.1.a.1.b (the dies-trigger looks back at where the
 * unit was), 323.4 (combat deaths are deaths). "My battlefield" = the battlefield
 * Kog'Maw died at — friendly AND enemy units there are hit; a base is not a battlefield.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-190-298";
/** Inline vanilla 2-damage spell — enough to kill the 1-Might Kog'Maw. */
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Bolt 2",
  timing: "action",
};

describe("Kog'Maw, Caustic (ogn-190-298)", () => {
  test("costs 3 energy + 1 chaos; 1-Might unit with Deathknell; unaffordable without the chaos", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).hand(P1, CARD, "kog").build();
    await game.p1.play("kog");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("kog")).toBe("base");
    expect(game.state("kog").might).toBe(1);
    expect(game.state("kog").keywords).toContain("Deathknell");
    const noPower = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "kog").build();
    expect(noPower.p1.can("play", "kog")).toBe(false);
    const low = await scenario().resources(P1, { energy: 2, power: { chaos: 1 } }).hand(P1, CARD, "kog").build();
    expect(low.p1.can("play", "kog")).toBe(false);
  });

  test.failing("BUG: dies at a battlefield → 4 damage to EVERY unit there (friend and foe); units elsewhere untouched", async () => {
    // Expected: foe3 dies, foe5/buddy take 4, bf2/base units untouched. Actual: resolving the trigger throws
    // "target.location?.startsWith is not a function" — the parsed target location is an object
    // ({ battlefield: "controlled" }) the resolver cannot handle, so the chain cannot resolve.
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", CARD, "kog")
      .unit(P1, "bf1", { might: 5 }, "buddy")
      .unit(P2, "bf1", { might: 3 }, "foe3")
      .unit(P2, "bf1", { might: 5 }, "foe5")
      .unit(P1, "bf2", { might: 5 }, "far")
      .unit(P2, "base", { might: 2 }, "home")
      .hand(P1, BOLT, "bolt")
      .build();
    await game.p1.cast("bolt", { targets: "kog" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Bolt resolves → Kog'Maw dies → Deathknell on the chain
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.zoneOf("foe3")).toBe("trash");
    expect(game.state("foe5").damage).toBe(4);
    expect(game.state("buddy").damage).toBe(4);
    expect(game.state("far").damage).toBe(0);
    expect(game.state("home").damage).toBe(0);
  });

  test.failing("BUG: dies in base → no battlefield, so nothing is damaged", async () => {
    // Expected: trigger resolves as a no-op. Actual: same resolver crash as above (chain stuck).
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "kog")
      .unit(P1, "base", { might: 5 }, "roomie")
      .unit(P1, "bf1", { might: 5 }, "field")
      .hand(P1, BOLT, "bolt")
      .build();
    await game.p1.cast("bolt", { targets: "kog" });
    await game.settle();
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.state("roomie").damage).toBe(0);
    expect(game.state("field").damage).toBe(0);
    expect(game.zoneOf("field")).toBe("battlefield-bf1");
  });

  test.failing("BUG: dying in combat also triggers Deathknell (323.4) — the 3-Might attacker that killed him takes 4 and dies", async () => {
    // Expected: P2's 3-Might attacker kills the defending Kog'Maw; Deathknell deals 4 to all units at bf1,
    // killing the attacker, so bf1 is not conquered. Actual: combat deaths fire no die trigger; attacker conquers.
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "kog")
      .unit(P2, "base", { might: 3 }, "atk")
      .build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.p2.points()).toBe(0);
  });
});
