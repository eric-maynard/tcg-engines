/**
 * Dr. Mundo, Expert — ogn-109-298 · Champion Unit · Mind · 8 energy + 2 mind power · 6 Might
 *
 *   My Might is increased by the number of cards in your trash.
 *   At the start of your Beginning Phase, recycle 3 from your trash.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-109-298";
const FILLER = "ogn-175-298";
const CONSULT = "ogn-083-298"; // Draw 2 (4 energy) — a cheap way to put one more card in the trash

describe("Dr. Mundo, Expert (ogn-109-298)", () => {
  test("cost: 8 energy + 2 mind; unaffordable with only 1 mind or 7 energy", async () => {
    const game = await scenario().resources(P1, { energy: 8, power: { mind: 2 } }).hand(P1, CARD, "mundo").build();
    await game.p1.play("mundo");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("mundo")).toBe("base");
    expect((await scenario().resources(P1, { energy: 8, power: { mind: 1 } }).hand(P1, CARD, "mundo").build()).p1.can("play", "mundo")).toBe(false);
    expect((await scenario().resources(P1, { energy: 7, power: { mind: 2 } }).hand(P1, CARD, "mundo").build()).p1.can("play", "mundo")).toBe(false);
  });

  test("Might is 6 + the number of cards in YOUR trash (opponent's trash does not count), tracking the trash as it grows", async () => {
    const game = await scenario()
      .resources(P1, { energy: 12, power: { mind: 2 } })
      .trash(P1, FILLER, "t1")
      .trash(P1, FILLER, "t2")
      .trash(P2, FILLER, "theirs")
      .hand(P1, CARD, "mundo")
      .hand(P1, CONSULT, "ctp")
      .build();
    await game.p1.play("mundo");
    expect(game.state("mundo").baseMight).toBe(6);
    expect(game.state("mundo").might).toBe(8);
    await game.p1.cast("ctp");
    await game.settle();
    expect(game.p1.trash()).toHaveLength(3);
    expect(game.state("mundo").might).toBe(9);
  });

  test("with an empty trash he is just a 6-Might unit", async () => {
    const game = await scenario().resources(P1, { energy: 8, power: { mind: 2 } }).trash(P2, FILLER).hand(P1, CARD, "mundo").build();
    await game.p1.play("mundo");
    expect(game.state("mundo").might).toBe(6);
  });

  test("at the start of YOUR Beginning Phase his trigger goes on the chain (and not on the opponent's)", async () => {
    const game = await scenario().turn(3).active(P2).trash(P1, FILLER, "t1").unit(P1, "base", CARD, "mundo").build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mundo", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    // P1 ends → P2's Beginning Phase: nothing from Mundo.
    await game.p1.endTurn();
    expect(game.chain()).toHaveLength(0);
  });

  test.failing("BUG: the Beginning Phase trigger recycles 3 cards from your trash (4 in trash → 1 left, 3 to the deck)", async () => {
    // Expected: three trash cards move to the bottom of P1's main deck, shrinking Mundo to 6+1.
    // Actual: the trigger resolves with no effect — the trash still holds all four cards.
    const game = await scenario()
      .turn(3)
      .active(P2)
      .trash(P1, FILLER, "t1")
      .trash(P1, FILLER, "t2")
      .trash(P1, FILLER, "t3")
      .trash(P1, FILLER, "t4")
      .unit(P1, "base", CARD, "mundo")
      .build();
    const deckBefore = game.p1.deck().length;
    await game.p2.endTurn();
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("t1", "t2", "t3");
      await game.settle();
    }
    expect(game.p1.trash()).toHaveLength(1);
    expect(game.p1.deck().length).toBe(deckBefore + 3 - 1); // +3 recycled, -1 drawn in the Draw phase
    expect(game.state("mundo").might).toBe(7);
  });
});
