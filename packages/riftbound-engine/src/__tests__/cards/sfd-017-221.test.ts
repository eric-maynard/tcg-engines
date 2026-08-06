/**
 * Sudden Storm — sfd-017-221 · Spell · Fury · 3 energy
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   [Action] (Play on your turn or in showdowns.)
 *   Deal 2 to a unit at a battlefield. If it's attacking, deal 4 to it instead.
 *
 * Rules: 811 (Hidden: hide facedown at a battlefield you control for [rainbow]; play it later
 * for 0), 806 (Action timing), 706 (attacking = a unit whose combat role is attacker during a
 * combat showdown). "Instead" replaces the 2 — an attacker takes exactly 4, never 6.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-017-221";

function board(energy = 3) {
  return scenario()
    .resources(P1, { energy, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 6, name: "Holder" }, "holder")
    .unit(P2, "bf1", { might: 6, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 6, name: "Homebody" }, "home")
    .hand(P1, CARD, "storm");
}

describe("Sudden Storm (sfd-017-221)", () => {
  test("costs 3 energy; deals 2 to a non-attacking unit at a battlefield; goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("storm", { targets: "raider" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    await game.settle();
    expect(game.state("raider").damage).toBe(2);
    expect(game.zoneOf("storm")).toBe("trash");
    const poor = await board(2).build();
    expect(poor.p1.can("cast", "storm")).toBe(false);
  });

  test("targets only units AT A BATTLEFIELD — a unit in a base is not a legal choice", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "storm")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["holder"], ["raider"]]));
    expect(targets).toHaveLength(2);
    const r = await game.p1.try((p) => p.cast("storm", { targets: "home" }));
    expect(r.ok).toBe(false);
  });

  test("if the target is attacking it takes 4 instead (exactly 4, not 2 and not 6)", async () => {
    // P2 attacks bf1 (held by P1). P2 (attacker) has Focus first and passes; P1 casts on the attacker.
    const game = await board().active(P2).unit(P2, "base", { might: 6, name: "Attacker" }, "atk").build();
    await game.p2.move("atk", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.state("atk").combatRole).toBe("attacker");
    await game.p2.passFocus();
    await game.p1.cast("storm", { targets: "atk" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("storm")).toBe("trash");
    expect(game.state("atk").damage).toBe(4);
  });

  test("a DEFENDING unit in the same combat is not attacking: it takes only 2", async () => {
    const game = await board().active(P2).unit(P2, "base", { might: 6, name: "Attacker" }, "atk").build();
    await game.p2.move("atk", "bf1");
    expect(game.state("holder").combatRole).toBe("defender");
    await game.p2.passFocus();
    await game.p1.cast("storm", { targets: "holder" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("holder").damage).toBe(2);
  });

  test("[Action]: not castable during the opponent's open main phase", async () => {
    const game = await board().active(P2).build();
    expect(game.p1.can("cast", "storm")).toBe(false);
  });

  test("[Hidden]: hide at a controlled battlefield for [rainbow]; next own turn play it from facedown for 0 energy", async () => {
    const game = await board().build();
    await game.p1.hide("storm", "bf1");
    expect(game.zoneOf("storm")).toBe("facedown-bf1");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { rainbow: 0 } });
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    const energy = game.p1.energy();
    await game.p1.reveal("storm", { answers: ["raider"] });
    expect(game.p1.energy()).toBe(energy);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("raider");
      await game.settle();
    }
    expect(game.state("raider").damage).toBe(2);
    expect(game.zoneOf("storm")).toBe("trash");
  });
});
