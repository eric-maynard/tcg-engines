/**
 * Ruling 4d7b6d62cd06d731 — Mask of Foresight (OGN-060 → ogn-060-298) · Gear · Calm · [2]
 *   "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *
 * Q: If Mask of Foresight is removed during the combat, does the +1 [Might] disappear?
 * A: No. This is a TRIGGERED ability, not a passive aura: once the trigger has resolved, the +1 is an
 *    independent "this turn" effect on the unit and outlives its source. (A passive would have vanished with
 *    the gear.)
 * Rules: 383 (triggered abilities resolve once and their effect stands on its own),
 *        507/508 (continuous effects from a resolved ability have their own duration, independent of the
 *        source object), 322 (static/passive effects stop applying the moment their source leaves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MASK_OF_FORESIGHT = "ogn-060-298";
const unit = (might: number, name: string) => ({ cardType: "unit", energyCost: 1, might, name }) as const;

/** P1's lone 3-Might unit attacks P2's 4-Might defender; the Mask sits in P1's base when `withMask`. */
async function soloAttack(withMask: boolean): Promise<Game> {
  let s = scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", unit(4, "Defender"), "def")
    .unit(P1, "base", unit(3, "Solo"), "solo");
  if (withMask) {
    s = s.gear(P1, MASK_OF_FORESIGHT, "mask");
  }
  const game = await s.build();
  await game.p1.move("solo", "bf1");
  if (withMask) {
    expect(game.chain()).toMatchObject([{ cardId: "mask", triggered: true }]);
    await game.p1.passPriority();
    await game.p2.passPriority();
  }
  return game;
}

describe("Ruling 4d7b6d62cd06d731 — the Mask's +1 is a resolved trigger and survives the gear's removal", () => {
  test("the trigger resolves into a plain 'this turn' bonus: the 3-Might attacker is at 4", async () => {
    const game = await soloAttack(true);

    expect(game.state("solo").might).toBe(4);
    expect(game.state("solo").mightModifier).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("banishing the Mask mid-combat leaves the +1 in place, and the attacker still trades with the 4-Might defender", async () => {
    const game = await soloAttack(true);

    await game.p1.do("banishCard", { cardId: game.card("mask") });
    expect(game.zoneOf("mask")).toBe("banishment");

    expect(game.state("solo").might).toBe(4); // unchanged — not an aura
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash"); // 4 damage into a 4-Might defender
    expect(game.zoneOf("solo")).toBe("trash");
  });

  test("control — without the Mask the same attacker is only 3 and the defender walks away", async () => {
    const game = await soloAttack(false);

    expect(game.state("solo").might).toBe(3);
    await game.settle();
    expect(game.zoneOf("solo")).toBe("trash");
    expect(game.locationOf("def")).toBe("bf1");
  });
});
