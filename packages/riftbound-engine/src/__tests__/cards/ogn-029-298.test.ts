/**
 * Falling Star — ogn-029-298 · Spell (Action) · Fury · 2 energy + [fury][fury]
 *
 *   Deal 3 to a unit.
 *   Deal 3 to a unit.
 *
 * Two separate targeted instructions: each chooses "a unit" independently, so the
 * caster may pick two different units (3 each) or the same unit twice (6 total).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const FALLING_STAR = "ogn-029-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7 }, "atBf")
    .unit(P2, "base", { might: 7 }, "atBase")
    .unit(P1, "base", { might: 7 }, "mine")
    .hand(P1, FALLING_STAR, "fs");
}

describe("Falling Star (ogn-029-298)", () => {
  test("costs 2 energy + 2 fury power; goes to trash after resolving", async () => {
    const game = await board().build();
    await game.p1.cast("fs", { targets: "atBf" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("fs")).toBe("chain");
    await game.settle();
    expect(game.zoneOf("fs")).toBe("trash");
  });

  test("not affordable with only 1 fury power or only 1 energy", async () => {
    const lowPower = await scenario().resources(P1, { energy: 2, power: { fury: 1 } }).unit(P2, "base", { might: 5 }, "u").hand(P1, FALLING_STAR, "fs").build();
    expect(lowPower.p1.can("cast", "fs")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 1, power: { fury: 2 } }).unit(P2, "base", { might: 5 }, "u").hand(P1, FALLING_STAR, "fs").build();
    expect(lowEnergy.p1.can("cast", "fs")).toBe(false);
  });

  test("first instruction: deals 3 to the chosen unit — any unit anywhere, either side, is a legal choice", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "fs")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["atBf"], ["atBase"], ["mine"]]));
    await game.p1.cast("fs", { targets: "atBase" });
    await game.settle();
    expect(game.state("atBase").damage).toBe(3);
    expect(game.state("atBf").damage).toBe(0);
  });

  test("second 'Deal 3 to a unit' — two different units can be chosen and each takes 3", async () => {
    // Expected: the spell asks for two unit choices (one per instruction); picking atBf and
    // atBase deals 3 to each. Actual: the engine only resolves the first parsed spell ability,
    // offering a single target slot and dealing 3 once.
    const game = await board().build();
    await game.p1.cast("fs", { targets: ["atBf", "atBase"] });
    await game.settle();
    expect(game.state("atBf").damage).toBe(3);
    expect(game.state("atBase").damage).toBe(3);
    expect(game.state("mine").damage).toBe(0);
  });

  test("choosing the same unit for both instructions deals 6 total (kills a 6-Might unit)", async () => {
    // Expected: "a unit" / "a unit" carry no "another" restriction, so the same unit may be
    // chosen twice and takes 3 + 3. Actual: only 3 damage is ever dealt.
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .unit(P2, "base", { might: 6 }, "big")
      .hand(P1, FALLING_STAR, "fs")
      .build();
    await game.p1.cast("fs", { targets: ["big", "big"] });
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash");
  });

  test("rule 355.8: locking only ONE target still resolves the second instruction — the caster is prompted for it", async () => {
    const game = await board().build();
    await game.p1.cast("fs", { targets: "atBf" });
    await game.settle();
    expect(game.decision()?.kind).toBe("pick");
    await game.p1.pick("atBase");
    await game.settle();
    expect(game.state("atBf").damage).toBe(3);
    expect(game.state("atBase").damage).toBe(3);
  });

  test("rule 355.8: with only one unit on board both instructions auto-target it (6 total, no prompt)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .unit(P2, "base", { might: 6 }, "big")
      .hand(P1, FALLING_STAR, "fs")
      .build();
    await game.p1.cast("fs", { targets: "big" });
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash");
  });

  test("no [Action]/[Reaction] in printed text ⇒ standard timing (rule 155): NOT castable during a showdown, nor on the opponent's turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf1", { might: 9 }, "wall")
      .hand(P1, FALLING_STAR, "fs")
      .build();
    await game.p1.move("ally", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "fs")).toBe(false);

    const oppTurn = await scenario().active(P2).resources(P1, { energy: 2, power: { fury: 2 } }).unit(P2, "base", { might: 5 }, "u").hand(P1, FALLING_STAR, "fs").build();
    expect(oppTurn.p1.can("cast", "fs")).toBe(false);
  });
});
