/**
 * Ruling 1a941bb7d7c3529d — Mask of Foresight (OGN-060 → ogn-060-298) · Gear · Calm · [2]
 *     "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Chaos [Action] [2][chaos] — "Move a friendly unit and ready it."
 *     (used to send the attacker home and let it attack a second time in the same turn).
 *
 * Q: Does Mask's +1 survive the unit leaving combat, and does it stack when the unit attacks alone again in
 *    the same turn?
 * A: Yes to both. The +1 lasts the rest of the turn no matter what happens afterwards — leaving the
 *    battlefield, being joined by allies, losing the attacker/defender designation. Each separate alone-attack
 *    grants another +1 on top (attack alone twice → +2). Several Masks each give their own +1 per attack.
 * Rules: 740.2.a (alone), 383.4.e/f (the trigger fires on gaining the designation), 317.2 ("this turn"
 *        modifiers expire only in the Ending Phase's Expiration Step — nothing earlier removes them).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MASK_OF_FORESIGHT = "ogn-060-298";
const RIDE_THE_WIND = "ogn-173-298";

/**
 * P1's turn. Mask in P1's base, a 3-Might Lone Wolf ready in base, a spare 2-Might Ally in base, and Ride the
 * Wind in hand with [2][chaos]. P2 holds bf1 and bf2, each with a 1-Might speed bump.
 */
function board() {
  return scenario()
    .victoryScore(20)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .gear(P1, MASK_OF_FORESIGHT, "mask")
    .unit(P1, "base", { might: 3, name: "Lone Wolf" }, "wolf")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "bf1", { might: 1, name: "Bump One" }, "bump1")
    .unit(P2, "bf2", { might: 1, name: "Bump Two" }, "bump2")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Wolf attacks bf1 alone; Mask's trigger resolves and the combat is fought out. */
async function attackedAlone(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("wolf", "bf1");
  expect(game.state("wolf").combatRole).toBe("attacker");
  await game.settle();
  expect(game.zoneOf("bump1")).toBe("trash");
  expect(game.locationOf("wolf")).toBe("bf1");
  expect(game.state("wolf")).toMatchObject({ might: 4, mightModifier: 1 });
  return game;
}

/** Ride the Wind the Wolf back to base, readied. */
async function ridHome(game: Game): Promise<void> {
  await game.p1.cast("rtw", { targets: "wolf" });
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("base");
  }
  await game.settle();
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf("wolf")).toBe("base");
  expect(game.state("wolf").isReady).toBe(true);
}

describe("Ruling 1a941bb7d7c3529d — Mask of Foresight's +1 lasts the whole turn and stacks per alone-attack", () => {
  test("attacking alone grants the +1, and it is still there once the combat is over and the attacker designation is gone", async () => {
    const game = await attackedAlone();
    expect(game.state("wolf").combatRole).not.toBe("attacker");
    expect(game.state("wolf").mightModifier).toBe(1);
    expect(game.state("wolf").might).toBe(4);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("the bonus survives LEAVING the battlefield: Ride the Wind sends the Wolf back to base and it is still a 4", async () => {
    const game = await attackedAlone();
    await ridHome(game);
    expect(game.state("wolf")).toMatchObject({ might: 4, mightModifier: 1 });
  });

  test("the bonus survives being JOINED by another friendly unit — 'alone' mattered only when the trigger fired", async () => {
    const game = await attackedAlone();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.p1.units("bf1").toSorted()).toEqual(["ally", "wolf"]);
    expect(game.state("wolf")).toMatchObject({ might: 4, mightModifier: 1 });
  });

  test("THE RULING: attacking alone a second time in the same turn STACKS — the Wolf ends the turn at +2 (3 → 5)", async () => {
    const game = await attackedAlone();
    await ridHome(game);
    await game.p1.move("wolf", "bf2");
    expect(game.state("wolf").combatRole).toBe("attacker");
    await game.settle();
    expect(game.zoneOf("bump2")).toBe("trash");
    expect(game.state("wolf")).toMatchObject({ mightModifier: 2, might: 5 });
    expect(game.violations()).toEqual([]);
  });

  test("multiple Masks each give their own +1 for the same attack: two Masks → +2 on one alone-attack", async () => {
    const game = await board().gear(P1, MASK_OF_FORESIGHT, "mask2").build();
    await game.p1.move("wolf", "bf1");
    await game.settle();
    expect(game.state("wolf")).toMatchObject({ mightModifier: 2, might: 5 });
  });

  test("control: the stacked bonus is still 'this turn' — both instances expire together in the Ending Phase", async () => {
    const game = await attackedAlone();
    await ridHome(game);
    await game.p1.move("wolf", "bf2");
    await game.settle();
    expect(game.state("wolf").might).toBe(5);
    await game.advanceTurn();
    expect(game.state("wolf")).toMatchObject({ mightModifier: 0, might: 3 });
  });
});
