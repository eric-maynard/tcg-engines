/**
 * Invert Timelines — ogn-201-298 · Spell · Chaos · 3 energy + [chaos]
 *
 *   Each player discards their hand, then draws 4.
 *
 * Rules: 419 (discard: hand → trash), 413 (draw), a spell with no [Action]/[Reaction]
 * is playable only on your own turn in an open state; the resolving spell itself is on
 * the chain (not in hand) so it is not "discarded" — it goes to trash after resolving.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-201-298";
const FILLER = "ogn-175-298"; // vanilla unit used as hand padding

function board(p1Hand: number, p2Hand: number) {
  const b = scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).hand(P1, CARD, "invert");
  for (let i = 0; i < p1Hand; i++) {
    b.hand(P1, FILLER, `p1h${i}`);
  }
  for (let i = 0; i < p2Hand; i++) {
    b.hand(P2, FILLER, `p2h${i}`);
  }
  return b;
}

describe("Invert Timelines (ogn-201-298)", () => {
  test("costs 3 energy + 1 chaos; goes to trash after resolving; unaffordable without the chaos or at 2 energy", async () => {
    const game = await board(1, 1).build();
    await game.p1.cast("invert");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("invert")).toBe("chain");
    await game.settle();
    expect(game.zoneOf("invert")).toBe("trash");
    const noChaos = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "invert").build();
    expect(noChaos.p1.can("cast", "invert")).toBe(false);
    const low = await scenario().resources(P1, { energy: 2, power: { chaos: 1 } }).hand(P1, CARD, "invert").build();
    expect(low.p1.can("cast", "invert")).toBe(false);
  });

  test("each player discards their whole hand (to their own trash)…", async () => {
    const game = await board(2, 3).build();
    await game.p1.cast("invert");
    await game.settle();
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["p1h0", "p1h1", "invert"]));
    expect(game.p2.trash()).toEqual(expect.arrayContaining(["p2h0", "p2h1", "p2h2"]));
    expect(game.p2.trash()).toHaveLength(3);
    for (const id of ["p1h0", "p1h1", "p2h0", "p2h1", "p2h2"]) {
      expect(game.zoneOf(id)).toBe("trash");
    }
  });

  test("…then each draws 4: both hands are exactly 4 fresh cards off the top of each deck", async () => {
    const game = await board(2, 6).build();
    const p1Top4 = game.p1.deck().slice(0, 4);
    const p2Top4 = game.p2.deck().slice(0, 4);
    const p1Deck0 = game.p1.deck().length;
    const p2Deck0 = game.p2.deck().length;
    await game.p1.cast("invert");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(4);
    expect(game.p2.hand()).toHaveLength(4);
    expect(new Set(game.p1.hand())).toEqual(new Set(p1Top4));
    expect(new Set(game.p2.hand())).toEqual(new Set(p2Top4));
    expect(game.p1.deck()).toHaveLength(p1Deck0 - 4);
    expect(game.p2.deck()).toHaveLength(p2Deck0 - 4);
  });

  test("a player with an empty hand discards nothing but still draws 4", async () => {
    const game = await board(0, 0).build();
    await game.p1.cast("invert");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(4);
    expect(game.p2.hand()).toHaveLength(4);
    expect(game.p2.trash()).toHaveLength(0);
    expect(game.p1.trash()).toEqual(["invert"]);
  });

  test("timing: no [Action]/[Reaction] — not playable on the opponent's turn", async () => {
    const oppTurn = await board(1, 1).active(P2).build();
    expect(oppTurn.p1.can("cast", "invert")).toBe(false);
  });

  test("timing: without [Action] it cannot be played during a showdown, even on your own turn (308.1.a)", async () => {
    const showdown = await board(1, 1)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5 }, "def")
      .unit(P1, "base", { might: 1 }, "atk")
      .build();
    await showdown.p1.move("atk", "bf1");
    expect(showdown.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(showdown.p1.can("cast", "invert")).toBe(false);
  });
});
