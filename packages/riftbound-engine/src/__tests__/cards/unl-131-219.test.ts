/**
 * Abandon — unl-131-219 · Spell · Chaos · 2 energy
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Counter a spell. Return it to its owner's hand instead of putting it in their trash.
 *   [Predict]. (Look at the top card of your Main Deck. You may recycle it.)
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "unl-131-219";
const CLEAVE = "ogn-004-298"; // [Action] Give a unit [Assault 3] this turn. (1 energy)

/** 0-cost vanilla spell "Draw 1." — something to sit at the bottom of the chain. */
const SLOW_SPELL = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  energyCost: 0,
  name: "Filler Cantrip",
};

/** [Reaction] "Draw 1." for 1 energy — stacks on top while the chain is open. */
const REACTION_SPELL = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  energyCost: 1,
  name: "Filler Snap",
  timing: "reaction",
};

describe("Abandon (unl-131-219)", () => {
  // rule-id: unl-131-219 — the countered spell returns to its owner's hand
  // instead of going to their trash.
  test("countered spell is returned to its owner's hand, not trashed", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 2 })
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, CLEAVE, "cleave")
      .hand(P2, CARD, "abandon")
      .build();
    await game.p1.cast("cleave", { targets: "ally" });
    await game.p1.passPriority(); // rule 312.1
    await game.p2.cast("abandon");
    expect(game.chain().map((i) => i.cardId)).toEqual(["cleave", "abandon"]);
    await game.settle();
    // Decline the [Predict] recycle prompt.
    await game.p2.decline();
    await game.settle();
    expect(game.zoneOf("abandon")).toBe("trash");
    expect(game.zoneOf("cleave")).toBe("hand");
  });

  // rule 355.8 — the spell to counter is a caster-chosen target locked at play
  // time, so the trailing [Predict] must not cost the caster that choice: with
  // two spells pending, Abandon offers both and counters the one named.
  test("with two spells on the chain the caster picks which one Abandon counters", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 1 })
      .hand(P1, SLOW_SPELL, "cleave1")
      .hand(P1, CARD, "abandon")
      .hand(P2, REACTION_SPELL, "cleave2")
      .build();
    await game.p1.cast("cleave1");
    await game.p1.passPriority();
    await game.p2.cast("cleave2");
    await game.p2.passPriority(); // rule 312.1
    expect(game.chain().map((i) => i.cardId)).toEqual(["cleave1", "cleave2"]);
    const offered = game.p1
      .option("cast", "abandon")
      ?.fields.find((f) => f.name === "targets")?.options;
    expect(offered).toEqual(expect.arrayContaining([["cleave1"], ["cleave2"]]));
    // Counter the BOTTOM spell, not the topmost one the engine would default to.
    await game.p1.cast("abandon", { targets: "cleave1" });
    await game.settle();
    await game.p1.decline();
    await game.settle();
    expect(game.zoneOf("cleave1")).toBe("hand");
    expect(game.zoneOf("cleave2")).toBe("trash");
  });
});
