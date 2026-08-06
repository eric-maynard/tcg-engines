/**
 * Party Favors — ogn-071-298 · Spell · Calm · 3 energy
 *
 *   Each other player chooses Cards or Runes. For each player that chooses
 *   Cards, you and that player each draw 1. For each player that chooses
 *   Runes, you and that player each channel 1 rune exhausted.
 *
 * No [Action]/[Reaction]: playable only in a Neutral Open State on its
 * controller's turn (rule 155). The choice belongs to each OTHER player.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-071-298";

function board() {
  return scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "pf");
}

describe("Party Favors (ogn-071-298)", () => {
  test("cost: 3 energy puts it on the chain; not castable with 2 energy", async () => {
    const game = await board().build();
    await game.p1.cast("pf");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("pf")).toBe("chain");
    const poor = await board().resources(P1, { energy: 2 }).build();
    expect(poor.p1.can("cast", "pf")).toBe(false);
  });

  test("on resolution a Cards-or-Runes choice is presented", async () => {
    const game = await board().build();
    await game.p1.cast("pf");
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect(d && d.kind === "pick" ? d.options.map((o) => o.label) : []).toEqual(["Cards", "Runes"]);
  });

  test.failing("BUG: the OTHER player makes the Cards/Runes choice, not the caster", async () => {
    // Expected: P2 (the only other player) is the chooser. Actual: the caster P1 is asked.
    const game = await board().build();
    await game.p1.cast("pf");
    await game.settle();
    expect(game.decision()?.kind).toBe("pick");
    expect(game.actingSeat()).toBe(P2);
  });

  test.failing("BUG: Cards — you AND that player each draw 1", async () => {
    // Expected: both hands grow by one. Actual: only the caster draws.
    const game = await board().build();
    await game.p1.cast("pf");
    await game.settle();
    await game.acting().chooseMode(0);
    await game.settle();
    expect(game.zoneOf("pf")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p2.hand()).toHaveLength(1);
    expect(game.p1.runes()).toHaveLength(0);
  });

  test.failing("BUG: Runes — you AND that player each channel 1 rune exhausted", async () => {
    // Expected: each player gains one exhausted rune in their pool. Actual: only the caster channels.
    const game = await board().build();
    await game.p1.cast("pf");
    await game.settle();
    await game.acting().chooseMode(1);
    await game.settle();
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p2.runes()).toHaveLength(1);
    expect(game.p2.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("caster's side of each mode today: Cards draws you 1; Runes channels you 1 exhausted rune", async () => {
    const cards = await board().build();
    await cards.p1.cast("pf");
    await cards.settle();
    await cards.acting().chooseMode(0);
    await cards.settle();
    expect(cards.p1.hand()).toHaveLength(1);
    const runes = await board().build();
    await runes.p1.cast("pf");
    await runes.settle();
    await runes.acting().chooseMode(1);
    await runes.settle();
    expect(runes.p1.runes({ ready: false })).toHaveLength(1);
    expect(runes.p1.runeDeck()).toHaveLength(11);
  });

  test.failing("BUG: no [Action] keyword — not playable during a showdown on the opponent's turn (rules 155, 159.2.a)", async () => {
    // Expected: illegal in P2's Open State and still illegal once a showdown opens.
    // Actual: the engine treats every non-Reaction spell as [Action] and offers it in showdowns.
    const game = await board().active(P2).battlefield("bf1").unit(P2, "base", { might: 1 }, "u").build();
    expect(game.p1.can("cast", "pf")).toBe(false);
    await game.p2.move("u", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "pf")).toBe(false);
  });
});
