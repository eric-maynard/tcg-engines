/**
 * Divine Judgment — ogn-244-298 · Spell · Order · 7 energy + 2 [order]
 *
 *   Each player chooses 2 units, 2 gear, 2 runes, and 2 cards in their hands.
 *   Recycle the rest.
 *
 * Rules: 424.4.a (Recycle: put on the bottom of the corresponding deck — Main Deck
 * for main-deck cards, Rune Deck for runes). Each player makes their own choices;
 * anything of a category a player has 2 or fewer of is simply kept.
 *
 * Engine status: the hand-authored ability is four "recycle all" steps that the
 * executor turns into a no-op — nobody chooses and nothing is recycled.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-244-298";
const FILLER = "ogn-175-298";

/** Both players over the limit in every category: 3 units, 3 gear, 3 runes, 3 (other) hand cards. */
function crowded() {
  const b = scenario().resources(P1, { energy: 7, power: { order: 2 } }).hand(P1, CARD, "dj");
  for (const p of [P1, P2]) {
    for (let i = 1; i <= 3; i++) {
      b.unit(p, "base", { might: i, name: `Unit ${p} ${i}` }, `${p}-u${i}`);
      b.gear(p, { name: `Gear ${p} ${i}` }, `${p}-g${i}`);
      b.hand(p, FILLER, `${p}-h${i}`);
    }
    b.runes(p, p === P1 ? "order" : "fury", 3);
  }
  return b;
}

describe("Divine Judgment (ogn-244-298)", () => {
  test("costs 7 energy + 2 order; no targets are chosen on play; resolves to trash", async () => {
    const game = await crowded().build();
    expect(game.p1.option("cast", "dj")?.fields.filter((f) => f.arg === "targets")).toEqual([]);
    await game.p1.cast("dj");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("dj")).toBe("chain");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("dj")).toBe("trash");
    const short = await scenario().resources(P1, { energy: 7, power: { order: 1 } }).hand(P1, CARD, "dj").build();
    expect(short.p1.can("cast", "dj")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 6, power: { order: 2 } }).hand(P1, CARD, "dj").build();
    expect(lowEnergy.p1.can("cast", "dj")).toBe(false);
  });

  test.failing("BUG: each player keeps exactly 2 units, 2 gear and 2 hand cards of their choice; the rest are recycled to the bottom of their Main Deck", async () => {
    // Expected: both players are prompted per category; afterwards each has 2 units, 2 gear, 2 cards
    // in hand, and the third of each sits in that owner's main deck. Actual: nothing happens.
    const game = await crowded().build();
    await game.p1.cast("dj");
    await game.settle({ policy: "first" });
    expect(game.decision()?.kind).toBe("action");
    for (const p of [game.p1, game.p2]) {
      expect(p.units()).toHaveLength(2);
      expect(p.gear()).toHaveLength(2);
      expect(p.hand()).toHaveLength(2);
      const recycled = p.deck().filter((id) => !id.includes("filler"));
      expect(recycled).toHaveLength(3); // one unit + one gear + one hand card
      expect(p.trash()).toEqual(p === game.p1 ? ["dj"] : []); // recycled, not discarded/killed
    }
  });

  test.failing("BUG: each player keeps 2 runes; the rest are recycled to the bottom of their Rune Deck", async () => {
    // Expected: 3 runes in play → 2 remain, rune deck grows from 12 to 13. Actual: all 3 stay.
    const game = await crowded().build();
    const runeDeckBefore = game.p2.runeDeck().length;
    await game.p1.cast("dj");
    await game.settle({ policy: "first" });
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p2.runes()).toHaveLength(2);
    expect(game.p2.runeDeck()).toHaveLength(runeDeckBefore + 1);
  });

  test("a player with 2 or fewer of a category keeps all of them", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { order: 2 } })
      .unit(P1, "base", { might: 1 }, "u1")
      .unit(P1, "base", { might: 1 }, "u2")
      .unit(P2, "base", { might: 1 }, "e1")
      .gear(P2, { name: "Trinket" }, "eg")
      .runes(P1, "order", 2)
      .hand(P2, FILLER, "eh1")
      .hand(P2, FILLER, "eh2")
      .hand(P1, CARD, "dj")
      .build();
    await game.p1.cast("dj");
    await game.settle({ policy: "first" });
    expect(game.p1.units().sort()).toEqual(["u1", "u2"]);
    expect(game.p2.units()).toEqual(["e1"]);
    expect(game.p2.gear()).toEqual(["eg"]);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p2.hand().sort()).toEqual(["eh1", "eh2"]);
    expect(game.zoneOf("dj")).toBe("trash");
  });
});
