/**
 * Ruling f7493c4e5d59e2de — Garbage Grabber (OGN-099 → ogn-099-298) · Gear · Mind · [2]
 *   "Recycle 3 from your trash, [1], [Exhaust]: Draw 1."
 *
 * Q: Is "Recycle 3 from your trash" part of the COST to draw 1, or does "do as much as you can" let you activate it
 *    for just [1] + exhaust when your trash is short?
 * A: It is part of the cost. You must be able to recycle 3, pay [1] and exhaust the Grabber to draw 1. "Do as much
 *    as you can" governs resolving effects whose situation changed, never the paying of costs.
 * Rules: 396/397 (activated ability "cost : effect" — everything before the colon is cost, paid in full up front),
 *        130 (costs must be paid entirely), 359.3.e (DAMAYC applies to instructions on resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GARBAGE_GRABBER = "ogn-099-298";
const JUNK = { cardType: "unit", energyCost: 1, might: 1, name: "Junk" } as const;

function board(trashCount: number, energy = 1) {
  const s = scenario().turn(3).resources(P1, { energy }).gear(P1, GARBAGE_GRABBER, "gg").unit(P2, "base", { might: 1, name: "Theirs" }, "theirs");
  for (let i = 1; i <= trashCount; i++) {
    s.trash(P1, JUNK, `t${i}`);
  }
  return s;
}

describe("Ruling f7493c4e5d59e2de — Garbage Grabber's 'Recycle 3 from your trash' is a cost, so all of it must be payable", () => {
  test("with only 2 cards in trash (but the [1] and a ready Grabber) the ability is NOT activatable — no partial 'do as much as you can' activation, nothing is spent", async () => {
    const game = await board(2).build();
    expect(game.p1.can("activate", "gg")).toBe(false);
    const r = await game.p1.try((p) => p.activate("gg"));
    expect(r.ok).toBe(false);
    expect(game.p1.trash().sort()).toEqual(["t1", "t2"]);
    expect(game.p1.energy()).toBe(1);
    expect(game.state("gg").isExhausted).toBe(false);
    expect(game.chain()).toEqual([]);
  });

  test("(0 cards in trash: likewise not activatable)", async () => {
    const game = await board(0).build();
    expect(game.p1.can("activate", "gg")).toBe(false);
  });

  test("with exactly 3 in trash: activating pays ALL THREE costs up front — the 3 cards leave the trash for the deck bottom, [1] is spent, the Grabber exhausts — and the effect then draws 1", async () => {
    const game = await board(3).build();
    const deckBefore = game.p1.deck().length;
    const handBefore = game.p1.hand().length;
    expect(game.p1.can("activate", "gg")).toBe(true);
    await game.p1.activate("gg");
    // Costs are paid as it goes on the chain, before resolution:
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.energy()).toBe(0);
    expect(game.state("gg").isExhausted).toBe(true);
    expect(game.p1.deck().slice(-3).sort()).toEqual(["t1", "t2", "t3"]);
    expect(game.p1.hand()).toHaveLength(handBefore); // not drawn yet
    await game.settle();
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.p1.deck()).toHaveLength(deckBefore + 3 - 1);
    expect(game.violations()).toEqual([]);
  });

  test("the other cost parts are equally mandatory: 3 in trash but no energy, or an already-exhausted Grabber → not activatable", async () => {
    const noEnergy = await board(3, 0).build();
    expect(noEnergy.p1.can("activate", "gg")).toBe(false);
    const tapped = await scenario().turn(3).resources(P1, { energy: 1 }).gear(P1, GARBAGE_GRABBER, "gg", { exhausted: true }).trash(P1, JUNK, "t1").trash(P1, JUNK, "t2").trash(P1, JUNK, "t3").build();
    expect(tapped.p1.can("activate", "gg")).toBe(false);
  });
});
