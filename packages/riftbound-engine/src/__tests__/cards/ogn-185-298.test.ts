/**
 * Traveling Merchant — ogn-185-298 · Unit · Chaos · 2 energy · 2 Might
 *
 *   When I move, discard 1, then draw 1.
 *
 * Rule 422.4 / 359.3.e.11: with an empty hand the discard is ignored but the
 * draw still happens. "When I move" covers any move (to a battlefield or back
 * to base).
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ogn-185-298";
const FILLER = "ogn-175-298"; // vanilla unit used as hand/deck cards

function board(handCards: string[]) {
  const b = scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", CARD, "merchant")
    .deckTop(P1, FILLER, "topdeck");
  for (const alias of handCards) {
    b.hand(P1, FILLER, alias);
  }
  return b;
}

describe("Traveling Merchant (ogn-185-298)", () => {
  test("moving puts the trigger on the chain; with one card in hand it is discarded, then you draw 1", async () => {
    const game = await board(["junk"]).build();
    await game.p1.move("merchant", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", triggered: true })]);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("junk");
      await game.settle();
    }
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand()).toEqual(["topdeck"]);
    expect(game.locationOf("merchant")).toBe("bf1");
  });

  test("with several cards in hand YOU choose which one to discard; hand size stays the same", async () => {
    const game = await board(["keep", "junk"]).build();
    await game.p1.move("merchant", "bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("junk");
    await game.settle();
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.zoneOf("keep")).toBe("hand");
    expect(game.p1.hand().sort()).toEqual(["keep", "topdeck"]);
  });

  test("empty hand — the discard is skipped but you still draw 1 (rules 422.4 / 359.3.e.11)", async () => {
    // Expected: nothing to discard → discard ignored, then draw 1 → hand = [topdeck].
    // Actual: the trigger resolves but the `then: draw` is skipped when the discard did nothing.
    const game = await board([]).build();
    await game.p1.move("merchant", "bf1");
    await game.settle();
    expect(game.p1.hand()).toEqual(["topdeck"]);
    expect(game.p1.trash()).toEqual([]);
  });

  test("'When I move' includes moving from a battlefield back to base", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "merchant")
      .hand(P1, FILLER, "junk")
      .deckTop(P1, FILLER, "topdeck")
      .build();
    await game.p1.move("merchant", "base");
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("junk");
      await game.settle();
    }
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand()).toEqual(["topdeck"]);
  });

  test("only MY moves: another friendly unit moving does not trigger it", async () => {
    const game = await board(["junk"]).unit(P1, "base", { might: 1 }, "other").build();
    await game.p1.move("other", "bf1");
    expect(game.chain()).toHaveLength(0);
    expect(game.zoneOf("junk")).toBe("hand");
    expect(game.p1.hand()).toEqual(["junk"]);
  });

  test("cost: 2 energy, enters exhausted as a 2-Might unit; unaffordable with 1 energy", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "merchant").build();
    await game.p1.play("merchant");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("merchant")).toBe("base");
    expect(game.state("merchant").isExhausted).toBe(true);
    expect(game.state("merchant").might).toBe(2);
    expect(game.chain()).toHaveLength(0); // playing is not moving
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "merchant").build();
    expect(poor.p1.can("play", "merchant")).toBe(false);
  });
});
