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
    await game.p2.cast("abandon");
    expect(game.chain().map((i) => i.cardId)).toEqual(["cleave", "abandon"]);
    await game.settle();
    // Decline the [Predict] recycle prompt.
    await game.p2.decline();
    await game.settle();
    expect(game.zoneOf("abandon")).toBe("trash");
    expect(game.zoneOf("cleave")).toBe("hand");
  });
});
