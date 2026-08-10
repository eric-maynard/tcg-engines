/**
 * Ruling 8fc60148e9689bdc — Mask of Foresight (OGN-060 → ogn-060-298) × Fight or Flight (OGN-168 → ogn-168-298)
 *
 *   Mask of Foresight — Gear · Calm · 2: "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *   Fight or Flight — Spell · Chaos · 2 · [Hidden] [Action]: "Move a unit from a battlefield to its base."
 *
 * Q: Mask triggers on a unit attacking alone, but the opponent Fight-or-Flights that unit back to base before the Mask
 *    effect resolves. Does the unit still get +1?
 * A: Yes. "Attacking alone" only has to be true when the trigger goes on the chain; nothing is re-checked on
 *    resolution. The unit, now in base and no longer attacking, still gets +1 Might for the turn.
 * Rules: 383 (trigger condition checked once), 359.3 (resolution), 811 (Hidden card played as a Reaction).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MASK = "ogn-060-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/**
 * P2's turn. P2: Mask of Foresight in base, lone Raider (3) ready in base. P1 holds bf1 with Guard (4) and has Fight or
 * Flight hidden at bf1 since an earlier turn (playable as a Reaction for [0]).
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .gear(P2, MASK, "mask")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
    .facedown(P1, "bf1", FIGHT_OR_FLIGHT, "fof");
}

/** Raider attacks alone → Mask trigger on the chain; P2 passes; P1 flips Fight or Flight at the Raider; it resolves (LIFO) first. */
async function attackThenBounce(game: Game): Promise<void> {
  await game.p2.move("raider", "bf1");
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mask", controller: P2, triggered: true })]);
  expect(game.state("raider").might).toBe(3); // trigger pending, not resolved
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "fof")).toBe(true);
  await game.p1.reveal("fof");
  for (let i = 0; i < 3 && game.decision()?.kind === "pick"; i++) {
    await game.acting().pick("raider");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["mask", "fof"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Fight or Flight resolves: Raider → P2's base
  expect(game.zoneOf("raider")).toBe("base");
  expect(game.chain().map((c) => c.cardId)).toEqual(["mask"]);
}

describe("Ruling 8fc60148e9689bdc — Mask of Foresight's +1 lands even after Fight or Flight bounced the attacker", () => {
  test("sequence: lone attack puts Mask's trigger on the chain; P1's hidden Fight or Flight answers and resolves first, returning the Raider to base with the Mask trigger still pending", async () => {
    const game = await board().build();
    await attackThenBounce(game);
    expect(game.state("raider").might).toBe(3);
    expect(game.zoneOf("fof")).toBe("trash");
  });

  test("the Mask trigger then resolves with no re-check: the Raider — in base, no longer attacking — gets +1 Might this turn (3 → 4)", async () => {
    const game = await board().build();
    await attackThenBounce(game);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Mask resolves
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.state("raider")).toMatchObject({ might: 4, mightModifier: 1 });
    // The emptied attack fizzles: no combat damage, Guard untouched, bf1 still P1's.
    await game.settle();
    expect(game.state("guard").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("raider").might).toBe(4); // keeps the bonus for the turn
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("'this turn': the +1 expires at end of turn", async () => {
    const game = await board().build();
    await attackThenBounce(game);
    await game.settle();
    expect(game.state("raider").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("raider").might).toBe(3);
  });
});
