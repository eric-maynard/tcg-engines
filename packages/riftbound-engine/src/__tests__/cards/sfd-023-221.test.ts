/**
 * Piercing Light — sfd-023-221 · Spell · Fury · 2 energy + [fury]
 *
 *   [Repeat] [2][fury] (You may pay the additional cost to repeat this spell's effect.)
 *   Deal 2 to a unit at a battlefield, then deal 2 to up to one other unit.
 *
 * Rules: 820 Repeat (optional additional cost; instructions execute one more time on resolution);
 * 355.8 (a mandatory target must be chosen to put the spell on the chain); 355.13 ("up to" may be
 * zero); no [Action]/[Reaction] → standard timing (own turn, Open state only).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-023-221";

function board(energy = 2, fury = 1) {
  return scenario()
    .resources(P1, { energy, power: { fury } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Front" }, "front")
    .unit(P2, "bf1", { might: 5, name: "Flank" }, "flank")
    .unit(P2, "base", { might: 5, name: "Home" }, "home")
    .hand(P1, CARD, "pl");
}

describe("Piercing Light (sfd-023-221)", () => {
  test("cost: 2 energy + 1 fury are deducted; unaffordable without the fury or with 1 energy", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "pl")).toBe(true);
    await game.p1.cast("pl", { targets: "front" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("pl")).toBe("chain");
    const noFury = await board(2, 0).build();
    expect(noFury.p1.can("cast", "pl")).toBe(false);
    const lowEnergy = await board(1, 1).build();
    expect(lowEnergy.p1.can("cast", "pl")).toBe(false);
  });

  test("deals 2 to a unit at a battlefield; units in a base are not offered as the first target; spell goes to trash", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "pl")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    expect(targets).toEqual(expect.arrayContaining([["front"], ["flank"]]));
    expect(targets.some((t) => Array.isArray(t) && t[0] === "home")).toBe(false);
    await game.p1.cast("pl", { targets: "front" });
    await game.settle();
    expect(game.state("front").damage).toBe(2);
    expect(game.state("flank").damage).toBe(0);
    expect(game.zoneOf("pl")).toBe("trash");
  });

  test("the first target is mandatory (rule 355.8) — casting with no target chosen must be refused", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "pl")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    expect(targets).not.toContainEqual([]);
  });

  test("'then deal 2 to up to one other unit' — a second, different unit (anywhere) may also take 2", async () => {
    const game = await board().build();
    await game.p1.cast("pl", { targets: ["front", "home"] });
    await game.settle();
    expect(game.state("front").damage).toBe(2);
    expect(game.state("home").damage).toBe(2);
    expect(game.state("flank").damage).toBe(0);
  });

  test("[Repeat] [2][fury]: paying 4 energy + 2 fury total executes the effect twice (4 damage) as one chain item", async () => {
    const game = await board(4, 2).build();
    await game.p1.cast("pl", { repeat: 1, targets: "front" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.state("front").damage).toBe(4);
    expect(game.zoneOf("pl")).toBe("trash");
  });

  test("[Repeat] cost must be affordable: with only 2 energy + 1 fury the repeated cast is refused, the plain one is fine", async () => {
    const game = await board(2, 1).build();
    const r = await game.p1.try((p) => p.cast("pl", { repeat: 1, targets: "front" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("pl")).toBe("hand");
    await game.p1.cast("pl", { targets: "front" });
    expect(game.zoneOf("pl")).toBe("chain");
  });

  test("timing: no [Action]/[Reaction] — not castable on the opponent's turn", async () => {
    const game = await board().active(P2).build();
    expect(game.p1.can("cast", "pl")).toBe(false);
  });
});
