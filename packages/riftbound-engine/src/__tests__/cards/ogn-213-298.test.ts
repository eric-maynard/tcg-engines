/**
 * Hidden Blade — ogn-213-298 · Spell · Order · 2 energy + [order] · Action
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   [Action] (Play on your turn or in showdowns.)
 *   Kill a unit at a battlefield. Its controller draws 2.
 *
 * Rules: 811 Hidden (hide facedown at a battlefield you control for [rainbow]; from a later
 * turn play it from there ignoring cost, choices restricted to that battlefield — 811.1.d.2),
 * 806 Action, 359.3.e.14 ("Its controller" links to the killed unit — whoever controlled it,
 * including yourself).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-213-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5 }, "foe")
    .unit(P1, "bf1", { might: 2 }, "mine")
    .unit(P2, "base", { might: 1 }, "home")
    .hand(P1, CARD, "blade");
}

describe("Hidden Blade (ogn-213-298)", () => {
  test("costs 2 energy + 1 order; kills the chosen unit at a battlefield (any Might); spell goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("battlefield-bf1");
    expect(game.zoneOf("blade")).toBe("trash");
    const noOrder = await scenario().resources(P1, { energy: 3 }).battlefield("bf1").unit(P2, "bf1", { might: 1 }, "u").hand(P1, CARD, "blade").build();
    expect(noOrder.p1.can("cast", "blade")).toBe(false);
    const low = await scenario().resources(P1, { energy: 1, power: { order: 1 } }).battlefield("bf1").unit(P2, "bf1", { might: 1 }, "u").hand(P1, CARD, "blade").build();
    expect(low.p1.can("cast", "blade")).toBe(false);
  });

  test.failing("BUG: 'Its controller draws 2' — killing an ENEMY unit makes the OPPONENT draw 2 and the caster nothing", async () => {
    // Expected: P2 (the killed unit's controller) draws 2; P1's hand only loses the spell.
    // Actual: the caster always draws the 2 cards, P2 draws none.
    const game = await board().build();
    const p1Hand0 = game.p1.hand().length;
    const p2Hand0 = game.p2.hand().length;
    await game.p1.cast("blade", { targets: "foe" });
    await game.settle();
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 2);
    expect(game.p1.hand()).toHaveLength(p1Hand0 - 1); // only the spell left the hand
  });

  test("'Its controller draws 2': killing your OWN unit makes YOU draw 2 (opponent draws nothing)", async () => {
    const game = await board().build();
    const p2Hand0 = game.p2.hand().length;
    await game.p1.cast("blade", { targets: "mine" });
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p2.hand()).toHaveLength(p2Hand0);
  });

  test("targets only units AT A BATTLEFIELD (either side's); a unit in a base is never offered", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "blade")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["foe"], ["mine"]]));
    const t = await game.p1.try((p) => p.cast("blade", { targets: "home" }));
    expect(t.ok).toBe(false);
    const none = await scenario().resources(P1, { energy: 2, power: { order: 1 } }).unit(P2, "base", { might: 1 }, "home").hand(P1, CARD, "blade").build();
    expect(none.p1.can("cast", "blade")).toBe(false);
  });

  test("[Action]: not playable on the opponent's turn outside a showdown; playable inside one", async () => {
    const idle = await board().active(P2).build();
    expect(idle.p1.can("cast", "blade")).toBe(false);
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1 }, "def")
      .unit(P2, "base", { might: 4 }, "atk")
      .hand(P1, CARD, "blade")
      .build();
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "blade")).toBe(true);
    await game.p1.cast("blade", { targets: "atk" });
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.locationOf("def")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("[Hidden]: hide for [rainbow] at a battlefield you control (facedown, no chain); not without power / at an enemy battlefield", async () => {
    const game = await scenario().resources(P1, { power: { rainbow: 1 } }).battlefield("bf1", { controller: P1 }).hand(P1, CARD, "blade").build();
    await game.p1.hide("blade", "bf1");
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("reveal", "blade")).toBe(false); // not on the turn it was hidden
    const noPower = await scenario().resources(P1, { energy: 5 }).battlefield("bf1", { controller: P1 }).hand(P1, CARD, "blade").build();
    expect(noPower.p1.can("hide", "blade")).toBe(false);
    const enemyBf = await scenario().resources(P1, { power: { rainbow: 1 } }).battlefield("bf1", { controller: P2 }).hand(P1, CARD, "blade").build();
    expect(enemyBf.p1.can("hide", "blade")).toBe(false);
  });

  test("[Hidden] later turn: played from facedown for 0, and only a unit at THAT battlefield can be chosen", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "guard") // keeps the hidden card company
      .unit(P2, "bf1", { might: 2 }, "here")
      .unit(P2, "bf2", { might: 2 }, "there")
      .hand(P1, CARD, "blade")
      .build();
    await game.p1.hide("blade", "bf1");
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    await game.p1.reveal("blade", { answers: ["here"] });
    const stop = await game.settle();
    if (stop.reason === "unanswered") {
      const d = game.decision();
      const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
      expect(keys).not.toContain("there");
      await game.p1.pick("here");
      await game.settle();
    }
    expect(game.zoneOf("here")).toBe("trash");
    expect(game.zoneOf("there")).toBe("battlefield-bf2");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.energy()).toBe(0); // played for [energy_0]
  });
});
