/**
 * Maddened Marauder — ogn-191-298 · Unit · Chaos · 5 energy · 4 might
 *
 *   [Tank] (I must be assigned combat damage first.)
 *   When you play me, move a unit from a battlefield to its base.
 *
 * Rules: Tank (626.1.d — lethal damage must be assigned to Tank units first); the play trigger is
 * mandatory and may pick ANY unit (friendly or enemy) that is at a battlefield; "its base" = the
 * base of that unit's controller. This is a Move (446.1).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-191-298";

function board() {
  return scenario()
    .resources(P1, { energy: 5 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 2, name: "Enemy Raider" }, "ebf")
    .unit(P1, "bf2", { might: 2, name: "My Scout" }, "mbf")
    .unit(P2, "base", { might: 2, name: "Enemy Homebody" }, "ehome")
    .hand(P1, CARD, "mm");
}

describe("Maddened Marauder (ogn-191-298)", () => {
  test("cost: 5 energy for a 4-might Tank; play puts the trigger on the chain; unaffordable with 4", async () => {
    const game = await board().build();
    await game.p1.play("mm", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("mm")).toBe("base");
    expect(game.state("mm").might).toBe(4);
    expect(game.state("mm").keywords).toContain("Tank");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mm", controller: P1, triggered: true })]);
    const poor = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "mm").build();
    expect(poor.p1.can("play", "mm")).toBe(false);
  });

  test("play trigger: moving an ENEMY unit from a battlefield sends it to its controller's base", async () => {
    const game = await board().build();
    await game.p1.play("mm", { to: "base" });
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("ebf");
    await game.settle();
    expect(game.zoneOf("ebf")).toBe("base");
    expect(game.state("ebf").controller).toBe(P2);
    expect(game.p2.units("base")).toContain("ebf");
    expect(game.p1.units("base")).not.toContain("ebf");
    expect(game.p2.units("bf1")).toEqual([]);
  });

  test("play trigger: a FRIENDLY unit at a battlefield may be chosen and returns to your base", async () => {
    const game = await board().build();
    await game.p1.play("mm", { to: "base" });
    await game.settle();
    await game.p1.pick("mbf");
    await game.settle();
    expect(game.zoneOf("mbf")).toBe("base");
    expect(game.p1.units("base")).toContain("mbf");
    expect(game.locationOf("ebf")).toBe("bf1"); // untouched
  });

  test.failing("BUG: only units AT A BATTLEFIELD are legal choices — base units (and the Marauder itself) must not be offered", async () => {
    // Expected: options are exactly {ebf, mbf}. Actual: every unit on the board is listed,
    // including ehome and the Marauder sitting in base.
    const game = await board().build();
    await game.p1.play("mm", { to: "base" });
    await game.settle();
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card).sort() : [];
    expect(offered).toEqual(["ebf", "mbf"]);
  });

  test.failing("BUG: no unit at any battlefield — the trigger has nothing to choose and the game returns to the open main phase", async () => {
    // Expected: the trigger resolves with no legal unit; no prompt; board unchanged.
    // Actual: a mandatory pick over base units (ehome, the Marauder itself) is presented.
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: null })
      .unit(P2, "base", { might: 2 }, "ehome")
      .hand(P1, CARD, "mm")
      .build();
    await game.p1.play("mm", { to: "base" });
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.zoneOf("mm")).toBe("base");
    expect(game.zoneOf("ehome")).toBe("base");
    expect(game.state("ehome").controller).toBe(P2);
  });

  test("Tank: in combat the attacker's damage must go to the Marauder first, sparing the smaller defender", async () => {
    // Defenders: Marauder (4, Tank) + a 1-might ally. Attacker has exactly 4 might: all 4 must be
    // assigned to the Tank (lethal), so the ally survives; defenders deal 5 back and kill the attacker.
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "mm")
      .unit(P1, "bf1", { might: 1, name: "Squire" }, "squire")
      .unit(P2, "base", { might: 4, name: "Attacker" }, "atk")
      .build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("mm")).toBe("trash");
    expect(game.locationOf("squire")).toBe("bf1");
    expect(game.state("squire").damage).toBe(0);
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
