/**
 * Ruling 8f24dac3808b1ea3 — (no specific card) can units be played straight to a battlefield?
 *   Exercised with an inline vanilla "Test Grunt" and a 4-Might holder on each side.
 *
 * Q: Can you play units directly to battlefields you control?
 * A: Yes. A battlefield you control is a legal play destination for a unit from hand — you do not
 *    have to play it to your base and then move it. (Your base stays legal too; a battlefield you
 *    do NOT control is not, absent a card or board permission.)
 * Rules: 355.2.a (a unit may be played at your Base or at a Battlefield you control), 355.2.b
 *        (any further destination needs a permission), 143.4 (it enters exhausted anyway),
 *        450 / 344 (arriving somewhere you already control contests nothing — no showdown).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GRUNT = { cardType: "unit", domain: "fury", energyCost: 1, might: 3, name: "Test Grunt" } as const;

/** P1 durably controls bf1 (a holder unit stands there); P2 controls bf2. */
const board = () =>
  scenario()
    .resources(P1, { energy: 4, power: { fury: 3 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 4, name: "Squatter" }, "squatter")
    .hand(P1, GRUNT, "grunt");

describe("Ruling 8f24dac3808b1ea3 — units may be played straight onto a battlefield you control", () => {
  test("playing to bf1 puts the unit there directly — no trip through base", async () => {
    const game = await board().build();
    await game.p1.play("grunt", { to: "bf1" });
    expect(game.zoneOf("grunt")).toBe("battlefield-bf1");
    expect(game.locationOf("grunt")).toBe("bf1");
    expect(game.p1.units("bf1").sort()).toEqual(["grunt", "holder"]);
  });

  test("it is a reinforcement, not an attack: the battlefield stays P1's, uncontested, and no showdown opens", async () => {
    const game = await board().build();
    await game.p1.play("grunt", { to: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)?.active).toBeFalsy();
    expect(game.state("grunt").combatRole).toBeNull();
    expect(game.state("grunt").isExhausted).toBe(true); // 143.4 — arriving this way still enters exhausted
    await game.settle();
    expect(game.violations()).toEqual([]);
  });

  test("your base remains a legal destination for the same card — it is a choice, not a redirect", async () => {
    const game = await board().build();
    await game.p1.play("grunt", { to: "base" });
    expect(game.zoneOf("grunt")).toBe("base");
  });

  test("a battlefield you do NOT control is not on the menu", async () => {
    const game = await board().build();
    const denied = await game.p1.try((p) => p.play("grunt", { to: "bf2" }));
    expect(denied.ok).toBe(false);
    expect(game.zoneOf("grunt")).toBe("hand");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
  });
});
