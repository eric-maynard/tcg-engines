/**
 * Void Seeker — ogn-024-298 · Spell · Fury · 3 energy + 1 [fury]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Deal 4 to a unit at a battlefield. Draw 1.
 *
 * Rule 359.3.e.5: the draw is not linked to the damage — it happens regardless.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-024-298";

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
    .unit(P2, "bf1", { might: 4, name: "Four" }, "four")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .hand(P1, CARD, "vs");
}

describe("Void Seeker (ogn-024-298)", () => {
  test("cost: casting deducts 3 energy and 1 fury power", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "vs")).toBe(true);
    await game.p1.cast("vs", { targets: "big" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("cost: not playable without the fury power or with only 2 energy", async () => {
    const noPower = await scenario().resources(P1, { energy: 3 }).battlefield("bf1").unit(P2, "bf1", { might: 1 }, "u").hand(P1, CARD, "vs").build();
    expect(noPower.p1.can("cast", "vs")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 2, power: { fury: 1 } }).battlefield("bf1").unit(P2, "bf1", { might: 1 }, "u").hand(P1, CARD, "vs").build();
    expect(noEnergy.p1.can("cast", "vs")).toBe(false);
  });

  test("deals 4 to the chosen unit at a battlefield (5-might survives with 4 damage; 4-might dies)", async () => {
    const game = await board().build();
    await game.p1.cast("vs", { targets: "big" });
    await game.settle();
    expect(game.state("big").damage).toBe(4);
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    expect(game.zoneOf("vs")).toBe("trash");

    const kill = await board().build();
    await kill.p1.cast("vs", { targets: "four" });
    await kill.settle();
    expect(kill.zoneOf("four")).toBe("trash");
  });

  test("targets: only units at a battlefield — a unit in a base is not a legal target", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "vs")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["big"], ["four"]]));
    const r = await game.p1.try((p) => p.cast("vs", { targets: "home" }));
    expect(r.ok).toBe(false);
    const none = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).unit(P2, "base", { might: 1 }, "home").hand(P1, CARD, "vs").build();
    expect(none.p1.can("cast", "vs")).toBe(false);
  });

  test("'Draw 1' — the caster draws a card when Void Seeker resolves", async () => {
    // Expected: hand goes from 1 (Void Seeker) to 1 (the drawn card) after resolution.
    // Actual: the parsed ability only carries the damage clause; no draw happens.
    const game = await board().build();
    const deckBefore = game.p1.deck().length;
    await game.p1.cast("vs", { targets: "big" });
    await game.settle();
    expect(game.state("big").damage).toBe(4);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck().length).toBe(deckBefore - 1);
  });

  test("[Action] timing: not playable on the opponent's turn outside a showdown", async () => {
    const game = await board().active(P2).build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("cast", "vs")).toBe(false);
  });

  function showdown() {
    return scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5, name: "Defender" }, "def")
      .unit(P2, "base", { might: 2, name: "Attacker" }, "atk")
      .hand(P1, CARD, "vs");
  }

  test("[Action] timing: playable during a showdown on the opponent's turn once P1 has focus", async () => {
    const game = await showdown().build();
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "vs")).toBe(true);
    await game.p1.cast("vs", { targets: "atk" });
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
  });

  test("[Action] timing — an Action spell is NOT playable in a showdown while the opponent holds Focus (rules 313.1, 347)", async () => {
    const game = await showdown().build();
    await game.p2.move("atk", "bf1");
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("cast", "vs")).toBe(false);
    const r = await game.p1.try((p) => p.cast("vs", { targets: "atk" }));
    expect(r.ok).toBe(false);
  });
});
