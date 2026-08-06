/**
 * Stupefy — ogn-095-298 · Spell · Mind · 1 energy
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-095-298";
const DISINTEGRATE = "ogn-005-298"; // [Action] 4 energy: deal 3 to a unit at a battlefield

function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .unit(P1, "base", { might: 1, name: "Tiny" }, "tiny")
    .hand(P1, CARD, "stup");
}

describe("Stupefy (ogn-095-298)", () => {
  test("costs 1 energy; gives a unit -1 Might this turn and the caster draws 1", async () => {
    const game = await board().build();
    const deckBefore = game.p1.deck().length;
    await game.p1.cast("stup", { targets: "foe" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("foe").might).toBe(2);
    expect(game.state("foe").baseMight).toBe(3);
    expect(game.p1.hand()).toHaveLength(1); // Stupefy left, one card drawn
    expect(game.p1.deck()).toHaveLength(deckBefore - 1);
    expect(game.zoneOf("stup")).toBe("trash");
  });

  test("any unit (friendly or enemy, any location) is a legal target", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "stup")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["foe"], ["tiny"]]));
  });

  test("'to a minimum of 1 Might': a 1-Might unit stays at 1, and the draw still happens", async () => {
    const game = await board().build();
    await game.p1.cast("stup", { targets: "tiny" });
    await game.settle();
    expect(game.state("tiny").might).toBe(1);
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("'this turn': the penalty is gone after the turn ends", async () => {
    const game = await board().build();
    await game.p1.cast("stup", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").might).toBe(2);
    await game.advanceTurn();
    expect(game.state("foe").might).toBe(3);
  });

  test("[Reaction] timing: playable on the opponent's turn onto their open chain, resolving first", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 4 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "ally")
      .unit(P2, "base", { might: 4 }, "brute")
      .hand(P2, DISINTEGRATE, "dis")
      .hand(P1, CARD, "stup")
      .build();
    await game.p2.cast("dis", { targets: "ally" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "stup")).toBe(true);
    await game.p1.cast("stup", { targets: "brute" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["dis", "stup"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    // Stupefy (top) resolved; Disintegrate still pending.
    expect(game.state("brute").might).toBe(3);
    expect(game.chain().map((i) => i.cardId)).toEqual(["dis"]);
    expect(game.p1.hand()).toHaveLength(1); // drew 1
  });

  test("not playable without 1 energy or without any unit in play", async () => {
    const noEnergy = await scenario().unit(P2, "base", { might: 3 }, "u").hand(P1, CARD, "s").build();
    expect(noEnergy.p1.can("cast", "s")).toBe(false);
    const noUnit = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "s").build();
    expect(noUnit.p1.can("cast", "s")).toBe(false);
  });
});
