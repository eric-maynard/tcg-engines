/**
 * Ruling baff3043618e1f39 — Star-Crossed (UNL-128 → unl-128-219) · Spell · [3][chaos] · [Reaction]
 *   "Return a friendly unit and an enemy unit to their owners' hands."
 *   × Serene Ascetic (VEN-030 → ven-030-166) · Unit · [3] · 3 Might · "[Empower] [3] · [Empowered][>] I have
 *     [Deflect] and [Shield 3]."
 *
 * Q: Can Star-Crossed be played as a reaction to an Empower ability?
 * A: Yes. Empower is an activated ability, so it goes on the Chain and creates a Closed State in which a
 *    [Reaction] may be played. Star-Crossed then resolves FIRST (LIFO), before the Empower completes, so
 *    the unit is not Empowered yet and its [Empowered] abilities are not live; bouncing it to hand leaves
 *    the Empower with nothing to do. Star-Crossed needs one friendly AND one enemy unit to target.
 * Rules: 827 (Empower is an activated ability), 377.3 (Closed State), 444 ([Reaction] timing),
 *        336/337 (LIFO), 359.3.e.5 (an instruction whose object is gone does nothing).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";
const SERENE_ASCETIC = "ven-030-166";

/** P2's turn: P2 has the Ascetic and [3] to Empower it; P1 holds Star-Crossed and one body of their own. */
function empowerOnTheChain(withFriendly = true) {
  const s = scenario()
    .active(P2)
    .resources(P2, { energy: 3 })
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .unit(P2, "base", SERENE_ASCETIC, "ascetic")
    .hand(P1, STAR_CROSSED, "sc");
  return withFriendly ? s.unit(P1, "base", { might: 2, name: "Consort" }, "mine") : s;
}

describe("Ruling baff3043618e1f39 — Star-Crossed answers an Empower and resolves before it", () => {
  test("the Empower activation is a Chain item, so P1 gets priority and the Reaction is legal", async () => {
    const game = await empowerOnTheChain().build();
    expect(game.p2.can("activate", "ascetic")).toBe(true);
    await game.p2.activate("ascetic", 0);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "ascetic", controller: P2, triggered: false, type: "ability" }),
    ]);
    expect(game.state("ascetic").isEmpowered).toBe(false); // not yet — it has not resolved
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "sc")).toBe(true);
  });

  test("Star-Crossed resolves first: both units go to hand and the Ascetic is never Empowered", async () => {
    const game = await empowerOnTheChain().build();
    await game.p2.activate("ascetic", 0);
    await game.p2.passPriority();
    await game.p1.cast("sc", { targets: ["mine", "ascetic"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ascetic", "sc"]); // the Reaction sits on top
    await game.settle();
    expect(game.zoneOf("mine")).toBe("hand");
    expect(game.zoneOf("ascetic")).toBe("hand");
    expect(game.state("ascetic").isEmpowered).toBe(false);
    expect(game.state("ascetic").keywords).toEqual([]); // no [Deflect] / [Shield 3]
    expect(game.chain()).toEqual([]); // the Empower resolved into nothing
    expect(game.violations()).toEqual([]);
  });

  test("control — left alone, the same Empower does resolve and turns the [Empowered] abilities on", async () => {
    const game = await empowerOnTheChain().build();
    await game.p2.activate("ascetic", 0);
    await game.settle();
    expect(game.state("ascetic").isEmpowered).toBe(true);
    expect(game.state("ascetic").keywords.toSorted()).toEqual(["Deflect", "Shield"]);
  });

  test("the spell needs one of each — with no friendly unit on P1's side it cannot be cast at all", async () => {
    const game = await empowerOnTheChain(false).build();
    await game.p2.activate("ascetic", 0);
    await game.p2.passPriority();
    expect(game.p1.can("cast", "sc")).toBe(false);
    const attempt = await game.p1.try((p) => p.cast("sc", { targets: ["ascetic"] }));
    expect(attempt.ok).toBe(false);
  });
});
