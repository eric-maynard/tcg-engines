/**
 * Rune Prison — ogn-050-298 · Spell · Calm · 2 energy + 1 [calm]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Stun a unit. (It doesn't deal combat damage this turn.)
 *
 * Rule 423.1.b: a stunned unit contributes no might in the combat damage step.
 * Rule 423.1.a.2: stunned status is removed during end-of-turn cleanup.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-050-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Defender" }, "def")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .unit(P1, "base", { might: 2, name: "Attacker" }, "atk")
    .hand(P1, CARD, "prison");
}

describe("Rune Prison (ogn-050-298)", () => {
  test("cost: casting deducts 2 energy + 1 calm; unaffordable without either", async () => {
    const game = await board().build();
    await game.p1.cast("prison", { targets: "def" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    const noPower = await scenario().resources(P1, { energy: 2 }).unit(P2, "base", { might: 1 }, "u").hand(P1, CARD, "prison").build();
    expect(noPower.p1.can("cast", "prison")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 1, power: { calm: 1 } }).unit(P2, "base", { might: 1 }, "u").hand(P1, CARD, "prison").build();
    expect(noEnergy.p1.can("cast", "prison")).toBe(false);
  });

  test("stuns the chosen unit; any unit (base or battlefield, either side) is a legal target", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "prison")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(expect.arrayContaining([["def"], ["home"], ["atk"]]));
    await game.p1.cast("prison", { targets: "def" });
    await game.settle();
    expect(game.state("def").isStunned).toBe(true);
    expect(game.state("home").isStunned).toBe(false);
    expect(game.zoneOf("prison")).toBe("trash");
  });

  test.failing("BUG: a stunned defender deals no combat damage — a 2-might attacker survives against a stunned 5-might defender (rule 423.1.b)", async () => {
    // Expected: the stunned defender contributes 0 might, so the attacker takes no damage, fails to
    // clear the defender (2 < 5) and is recalled to base after the combat heal (rule 466.1).
    // Actual: the defender still deals 5 and the attacker dies.
    const game = await board().build();
    await game.p1.cast("prison", { targets: "def" });
    await game.settle();
    expect(game.state("def").isStunned).toBe(true);
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("atk")).toBe("base");
    expect(game.state("atk").damage).toBe(0);
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
  });

  test.failing("BUG: the stun ends during the end-of-turn Expiration Step (rules 423.1.a.2 / 317.2.c)", async () => {
    // Expected: after P1's turn ends the defender is no longer stunned.
    // Actual: the `stunned` flag survives the turn boundary.
    const game = await board().build();
    await game.p1.cast("prison", { targets: "def" });
    await game.settle();
    expect(game.state("def").isStunned).toBe(true);
    await game.advanceTurn();
    expect(game.state("def").isStunned).toBe(false);
  });

  test("[Action] timing: not castable on the opponent's turn outside a showdown", async () => {
    const game = await board().active(P2).build();
    expect(game.p1.can("cast", "prison")).toBe(false);
  });
});
