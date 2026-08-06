/**
 * Decisive Strike — ogs-024-024 · Spell · Body/Order · 5 energy + [C] · Action
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Give friendly units +2 [Might] this turn.
 *
 * Rules: 806 Action, 135.2.e.6.c ([C] on a two-domain card = body OR order power),
 * "friendly units" = all units you control, everywhere (no choice is made — 355.5.a),
 * "this turn" expires in the end-of-turn cleanup.
 *
 * Engine status: the effect is parsed as a single-target "+2 to a friendly unit", so every
 * cast per the printed text (no target) is refused with a target prompt — see BUG tests.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogs-024-024";
// The engine currently asks for ONE friendly target (see the BUG test); `answers` tolerates that
// prompt without asserting it, so the other clauses can still be checked on the answered unit.
const TOLERATE = (unit: string) => ({ answers: [unit] });

function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 2 }, "home")
    .unit(P1, "bf1", { might: 3 }, "atBf1")
    .unit(P1, "bf2", { might: 1 }, "atBf2")
    .unit(P2, "bf2", { might: 4 }, "foe")
    .unit(P2, "base", { might: 2 }, "foeHome")
    .hand(P1, CARD, "strike");
}

function showdown() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 5, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3 }, "def")
    .unit(P1, "base", { might: 2 }, "home")
    .unit(P2, "base", { might: 4 }, "atk")
    .hand(P1, CARD, "strike");
}

describe("Decisive Strike (ogs-024-024)", () => {
  test("cost gate: legal with 5 energy + 1 body OR 1 order; not legal without a matching power or at 4 energy", async () => {
    const withBody = await board().build();
    expect(withBody.p1.can("cast", "strike")).toBe(true);
    const withOrder = await board().resources(P1, { energy: 5, power: { body: 0, order: 1 } }).build();
    expect(withOrder.p1.can("cast", "strike")).toBe(true);
    const noPower = await board().resources(P1, { energy: 6, power: { body: 0 } }).build();
    expect(noPower.p1.can("cast", "strike")).toBe(false);
    const wrongPower = await board().resources(P1, { energy: 6, power: { body: 0, fury: 1 } }).build();
    expect(wrongPower.p1.can("cast", "strike")).toBe(false);
    const low = await board().resources(P1, { energy: 4, power: { body: 1 } }).build();
    expect(low.p1.can("cast", "strike")).toBe(false);
  });

  test("cast with NO target (none is chosen); pays 5 + 1 body; ALL friendly units everywhere get +2, enemies unchanged", async () => {
    // Expected: a targetless cast; home 2→4, atBf1 3→5, atBf2 1→3; foe/foeHome untouched; spell in trash.
    // Actual: the engine demands a single friendly target ("needs `targets`"), so the printed play is refused.
    const game = await board().build();
    expect(game.p1.option("cast", "strike")?.fields.find((f) => f.arg === "targets")).toBeUndefined();
    await game.p1.cast("strike");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("strike")).toBe("trash");
    expect(game.state("home").might).toBe(4);
    expect(game.state("atBf1").might).toBe(5);
    expect(game.state("atBf2").might).toBe(3);
    expect(game.state("foe").might).toBe(4);
    expect(game.state("foeHome").might).toBe(2);
  });

  test("'+2 this turn' (checked on the unit the engine let us name): 5 energy + 1 body paid, home 2→4 now, back to 2 once the turn ends", async () => {
    const game = await board().build();
    await game.p1.cast("strike", TOLERATE("home"));
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("strike")).toBe("trash");
    expect(game.state("home").might).toBe(4);
    expect(game.state("foeHome").might).toBe(2);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("home").might).toBe(2);
    expect(game.state("atBf1").might).toBe(3);
    expect(game.state("atBf2").might).toBe(1);
  });

  test("one-shot, not a static — a unit played AFTER it resolves does not get the bonus", async () => {
    const game = await board().resources(P1, { energy: 7, power: { body: 1 } }).hand(P1, { energyCost: 2, might: 2 }, "late").build();
    await game.p1.cast("strike", TOLERATE("home"));
    await game.settle();
    await game.p1.play("late", { to: "base" });
    await game.settle();
    expect(game.zoneOf("late")).toBe("base");
    expect(game.state("late").might).toBe(2);
    expect(game.state("home").might).toBe(4);
  });

  test("[Action]: not playable on the opponent's turn outside a showdown; offered once P1 has Focus in a showdown", async () => {
    const idle = await board().active(P2).build();
    expect(idle.p1.can("cast", "strike")).toBe(false);
    const game = await showdown().build();
    expect(game.p1.can("cast", "strike")).toBe(false);
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "strike")).toBe(true);
  });

  test("cast in that showdown — the 3-Might defender becomes 5, kills the 4-Might attacker and survives; base units are pumped too", async () => {
    // Expected: targetless cast for 5 + order; atk takes 5 and dies, def takes 4 < 5; home is 4.
    // Actual: cast refused for want of a single target.
    const game = await showdown().build();
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("strike");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.locationOf("def")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("home").might).toBe(4);
  });
});
