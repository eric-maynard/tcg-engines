/**
 * Safety Inspector — unl-164-219 · Unit · Order · 5 energy · 3 Might
 *
 *   "You may spend 3 XP as an additional cost to play me.
 *    When you play me, each player must kill one of their units. If you paid my
 *    additional cost, you don't kill a unit this way."
 *
 * Rule 560 / 422.1.a: the XP is an optional additional cost; paying it exempts its
 * payer from the mass kill. Every other player still chooses among the units THEY
 * control (355.16).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "unl-164-219";

function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { order: 1 } })
    .xp(P1, 3)
    .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
    .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs")
    .hand(P1, CARD, "insp");
}

describe("Safety Inspector (unl-164-219)", () => {
  test("without the additional cost: each player kills one of their own units", async () => {
    const game = await board().build();
    await game.p1.play("insp");
    await game.settle();
    // rule 355.16 — the controller chooses among the units THEY control.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("mine");
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.zoneOf("insp")).toBe("base");
  });

  // rule 560 — "you don't kill a unit this way".
  test("paying the 3 XP exempts the controller; the opponent still kills one", async () => {
    const game = await board().build();
    await game.p1.play("insp", { payOptional: true });
    await game.settle();
    expect(game.p1.xp()).toBe(0);
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.zoneOf("theirs")).toBe("trash");
  });
});
