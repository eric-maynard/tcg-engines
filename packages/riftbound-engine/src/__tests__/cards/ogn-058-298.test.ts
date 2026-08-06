/**
 * Discipline — ogn-058-298 · Spell · Calm · 2 energy
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Give a unit +2 [Might] this turn. Draw 1.
 *
 * Reaction (rule 813): Action permissions plus play during Closed States on
 * any player's turn — but not in an opponent's Open State.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-058-298";
const CLEAVE = "ogn-004-298"; // [Action] Give a unit [Assault 3] this turn. (1 energy) — something for P2 to open a chain with

function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .unit(P1, "base", { might: 2 }, "ally")
    .unit(P2, "base", { might: 3 }, "foe")
    .deck(P1, ["ogn-175-298"], ["top"])
    .hand(P1, CARD, "disc");
}

describe("Discipline (ogn-058-298)", () => {
  test("gives the chosen unit +2 Might this turn and draws 1; costs 2 energy; goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "ally" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("ally").might).toBe(4);
    expect(game.state("ally").mightModifier).toBe(2);
    expect(game.p1.hand()).toEqual(["top"]);
    expect(game.zoneOf("disc")).toBe("trash");
  });

  test("'a unit': an enemy unit is a legal choice too", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "disc")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["ally"], ["foe"]]));
    await game.p1.cast("disc", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").might).toBe(5);
    expect(game.state("ally").might).toBe(2);
    expect(game.p1.hand()).toEqual(["top"]); // the caster draws, not the unit's controller
  });

  test("'this turn': the Might bonus is gone once the turn ends", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(2);
  });

  test("cost: not castable with 1 energy; not castable with no unit on the board (rule 355.8)", async () => {
    const poor = await board().resources(P1, { energy: 1 }).build();
    expect(poor.p1.can("cast", "disc")).toBe(false);
    const empty = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "disc").build();
    expect(empty.p1.can("cast", "disc")).toBe(false);
  });

  test("[Reaction] does not allow play during an opponent's Neutral Open State (rules 316.5.b, 813.1.c)", async () => {
    // Expected: with no chain and no showdown on P2's turn only P2 may play spells, so Discipline
    // is not legal for P1. Actual: the engine offers (and accepts) the play in the free menu.
    const game = await board().active(P2).build();
    expect(game.p1.can("cast", "disc")).toBe(false);
    const r = await game.p1.try((p) => p.cast("disc", { targets: "ally" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("disc")).toBe("hand");
  });

  test("[Reaction]: legal on the opponent's turn in response to their spell (Closed State); resolves first", async () => {
    const game = await board().active(P2).resources(P2, { energy: 1 }).hand(P2, CLEAVE, "cleave").build();
    await game.p2.cast("cleave", { targets: "foe" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "disc")).toBe(true);
    await game.p1.cast("disc", { targets: "ally" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["cleave", "disc"]);
    await game.settle();
    expect(game.state("ally").might).toBe(4);
    expect(game.p1.hand()).toEqual(["top"]);
  });
});
