/**
 * Ruling b895a482b76cab30 — Mask of Foresight (OGN-060 → ogn-060-298) · Gear · [2]
 *   "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · [Action] [2][chaos] · "Move a friendly unit and ready it."
 *
 * Q: Does the Mask trigger every time a unit attacks or defends in a showdown, and can it stack up over a turn?
 * A: It is a "when … attacks or defends" trigger, not a "while" passive: it fires per showdown, so several showdowns
 *    in one turn each give their own +1. The buff it already granted stays even if allies arrive at that battlefield
 *    afterwards — "alone" is only checked when the trigger fires.
 * Rules: 383.1/383.3 ("when" = a triggered ability that uses the Chain), 359.3 (conditions are read on triggering),
 *        317.2.c ("this turn").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MASK_OF_FORESIGHT = "ogn-060-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn: one Mask, two 2-[Might] bodies at home, two enemy battlefields each with a 2-[Might] wall. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Wall1" }, "wall1")
    .unit(P2, "bf2", { might: 2, name: "Wall2" }, "wall2")
    .unit(P1, "base", { might: 2, name: "A1" }, "a1")
    .unit(P1, "base", { might: 2, name: "A2" }, "a2")
    .gear(P1, MASK_OF_FORESIGHT, "mask");
}

/** Both players pass priority once, resolving the top Chain item. */
async function bothPass(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

describe("Ruling b895a482b76cab30 — the Mask fires per showdown, and its +1 sticks once granted", () => {
  test("a lone attacker sets it off — one trigger on the initial Chain, +1 when it resolves", async () => {
    const game = await board().build();
    await game.p1.move("a1", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mask", controller: P1, triggered: true })]);
    expect(game.state("a1").might).toBe(2);
    await bothPass(game);
    expect(game.state("a1")).toMatchObject({ might: 3, mightModifier: 1 });
  });

  test("attacking with company gives nothing — 'alone' is a real condition", async () => {
    const game = await board().build();
    await game.p1.move(["a1", "a2"], "bf1");
    expect(game.chain()).toEqual([]); // no Mask trigger at all
    expect(game.state("a1")).toMatchObject({ combatRole: "attacker", might: 2, mightModifier: 0 });
    expect(game.state("a2")).toMatchObject({ combatRole: "attacker", might: 2, mightModifier: 0 });
  });

  test("an ally arriving AFTER the trigger does not take the +1 away", async () => {
    const game = await board().hand(P1, RIDE_THE_WIND, "rtw").resources(P1, { energy: 2, power: { chaos: 1 } }).build();
    await game.p1.move("a1", "bf1");
    await bothPass(game);
    expect(game.state("a1").might).toBe(3);
    await game.p1.cast("rtw", { targets: "a2" }); // reinforcements into the same showdown
    await game.p1.pick("bf1"); // Ride the Wind's destination
    await bothPass(game);
    expect(game.p1.units("bf1").toSorted()).toEqual(["a1", "a2"]);
    expect(game.state("a1")).toMatchObject({ might: 3, mightModifier: 1 });
  });

  test("a second showdown in the same turn triggers the Mask again — for that unit", async () => {
    const game = await board().build();
    await game.p1.move("a1", "bf1");
    await game.settle();
    expect(game.state("a1").might).toBe(3);
    await game.p1.move("a2", "bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mask", triggered: true })]); // fires afresh
    await bothPass(game);
    expect(game.state("a2")).toMatchObject({ might: 3, mightModifier: 1 });
    expect(game.state("a1").might).toBe(3); // and the first one keeps its own
    expect(game.violations()).toEqual([]);
  });

  test("the grants are 'this turn' and reset for the next turn", async () => {
    const game = await board().build();
    await game.p1.move("a1", "bf1");
    await game.settle();
    expect(game.state("a1").might).toBe(3);
    await game.advanceTurn();
    expect(game.state("a1")).toMatchObject({ might: 2, mightModifier: 0 });
  });
});
