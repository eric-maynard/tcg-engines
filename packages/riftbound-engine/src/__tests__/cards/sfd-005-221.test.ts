/**
 * Detonate — sfd-005-221 · Spell · Fury · 1 energy + [fury]
 *
 *   Kill a gear. Its controller draws 2.
 *
 * Rules: 359.3.e.14 (linked instructions — "its controller" is the killed gear's controller,
 * whichever player that is), 355 (target = any gear on the board, friendly or enemy),
 * 159.2.a.1 (no [Action]/[Reaction] → standard timing: your turn, open state only).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-005-221";

function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .gear(P2, { cardType: "gear", name: "Enemy Trinket" }, "theirs")
    .gear(P1, { cardType: "gear", name: "My Trinket" }, "mine")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
    .hand(P1, CARD, "det");
}

describe("Detonate (sfd-005-221)", () => {
  test("cost: 1 energy + 1 fury is deducted; unaffordable without the fury or with 0 energy", async () => {
    const game = await board().build();
    await game.p1.cast("det", { targets: "theirs" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    const noPower = await board().resources(P1, { energy: 1, power: { fury: 0 } }).build();
    expect(noPower.p1.can("cast", "det")).toBe(false);
    const noEnergy = await board().resources(P1, { energy: 0, power: { fury: 1 } }).build();
    expect(noEnergy.p1.can("cast", "det")).toBe(false);
  });

  test("targets: any gear (friendly or enemy) — units are not offered; no gear on board → not castable", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "det")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["theirs"], ["mine"]]));
    const t = await game.p1.try((p) => p.cast("det", { targets: "foe" }));
    expect(!t.ok && t.error.code).toBe("ILLEGAL_ARGS");
    const empty = await scenario().resources(P1, { energy: 1, power: { fury: 1 } }).unit(P2, "base", { might: 2 }, "foe").hand(P1, CARD, "det").build();
    expect(empty.p1.can("cast", "det")).toBe(false);
  });

  test("kills the chosen enemy gear (only that one); Detonate goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("det", { targets: "theirs" });
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.zoneOf("det")).toBe("trash");
  });

  test("killing an ENEMY gear makes ITS controller (the opponent) draw 2 — the caster draws nothing (359.3.e.14)", async () => {
    // Expected: P2 (the killed gear's controller) draws 2, P1's hand only loses Detonate.
    // Actual: the draw is given to the caster — P1 draws 2 and P2 draws 0.
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("det", { targets: "theirs" });
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.p1.hand()).toHaveLength(p1Hand - 1);
  });

  test("killing your OWN gear makes YOU draw 2 (the opponent draws nothing)", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("det", { targets: "mine" });
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(p1Hand - 1 + 2);
    expect(game.p2.hand()).toHaveLength(p2Hand);
  });

  test("standard timing: not castable on the opponent's turn", async () => {
    const game = await board().active(P2).build();
    expect(game.p1.can("cast", "det")).toBe(false);
  });
});
