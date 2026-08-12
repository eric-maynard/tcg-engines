/**
 * Ruling eea5054e0caa29a0 — Salvage (OGN-224 → ogn-224-298) · Spell · [Action] · Order · [2][order]
 *   Printed today: "You may kill up to one gear. Draw 1."
 *
 * Q: Can you play Salvage when there are no gear in play?
 * A (riftjudge): No — a gear must be TARGETED when Salvage is played; the "may" only lets you decline the
 *    kill at resolution. Either way you draw 1.
 *
 * RULING-CONFLICT-ish: this answer describes the pre-errata wording ("You may kill a gear"). The card now
 * reads "up to one gear", and rule 355.13 makes zero a legal answer to an "up to N" choice — so the engine
 * offers the empty set at PLAY time and asks nothing at resolution (see the sibling ruling 1e9829e7a54e08f7,
 * which states this outcome as correct). The two facets where this answer and the engine disagree are kept as
 * failing assertions below; the rest of the answer (a chosen gear can be spared, and you always draw 1) is
 * asserted normally.
 * Rules: 355.8 (a play needs a legal choice), 355.13 ("up to N" is satisfied by zero), 419 (draw).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SALVAGE = "ogn-224-298";
const PACK_OF_WONDERS = "ogn-181-298"; // a plain gear

/** P1's main phase with exactly [2][order] and Salvage in hand. */
function board() {
  return scenario().resources(P1, { energy: 2, power: { order: 1 } }).hand(P1, SALVAGE, "salvage");
}

describe("Ruling eea5054e0caa29a0 — Salvage's gear choice", () => {
  test("premise: with no gear anywhere, there is nothing for Salvage to kill", async () => {
    const game = await board().build();
    expect(game.p1.gear()).toEqual([]);
    expect(game.p2.gear()).toEqual([]);
  });

  test.failing("BUG: ruling eea5054e0caa29a0 — Salvage should be unplayable with no gear in play; the engine allows it (post-errata 'up to one')", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "salvage")).toBe(false);
  });

  test.failing("BUG: ruling eea5054e0caa29a0 — with a gear on the board a gear should HAVE to be targeted; the engine also offers the empty target set", async () => {
    const game = await board().gear(P2, PACK_OF_WONDERS, "pack").build();
    const field = game.p1.option("cast", "salvage")?.fields.find((f) => f.arg === "targets");
    expect(field?.options).toEqual([["pack"]]);
  });

  test("agreed: a targeted gear can be spared and Salvage still draws 1", async () => {
    const game = await board().gear(P2, PACK_OF_WONDERS, "pack").build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("salvage", { targets: [] }); // the "don't kill it" branch
    await game.settle();
    expect(game.zoneOf("pack")).toBe("base");
    expect(game.zoneOf("salvage")).toBe("trash");
    expect(game.p1.hand().length).toBe(handBefore); // −Salvage +1 drawn
    expect(game.violations()).toEqual([]);
  });

  test("agreed: choosing the gear kills it, and you still draw 1", async () => {
    const game = await board().gear(P2, PACK_OF_WONDERS, "pack").build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("salvage", { targets: "pack" });
    await game.settle();
    expect(game.zoneOf("pack")).toBe("trash");
    expect(game.zoneOf("salvage")).toBe("trash");
    expect(game.p1.hand().length).toBe(handBefore);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("engine behaviour with zero gear: the play resolves, kills nothing and still draws 1", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("salvage");
    await game.settle();
    expect(game.zoneOf("salvage")).toBe("trash");
    expect(game.p1.hand().length).toBe(handBefore);
  });
});
