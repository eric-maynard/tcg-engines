/**
 * Ruling 2abed520c3c0be67 — Jinx, Rebel (OGN-202 → ogn-202-298) · 5 Might
 *   "When you discard one or more cards, ready me and give me +1 [Might] this turn."
 *
 * Q: Can Jinx be readied more than once per turn, and does she still get +1 if she is already ready
 *    when you discard?
 * A: Yes to both. Every discard event triggers her separately — there is no once-per-turn limit — and
 *    "ready me" on an already-ready Jinx simply does nothing while the +1 still applies (do what you can).
 *    Nuance: you must actually discard; with an empty hand nothing is discarded and nothing triggers.
 * Rules: 383.1 (one trigger per inciting event, no per-turn cap), 359.3.b (do as much as you can),
 *        610 (Might modifiers accumulate), 422 (discard).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const JINX_REBEL = "ogn-202-298";
const junk = (n: string) => ({ cardType: "unit", energyCost: 1, might: 1, name: `Junk ${n}` }) as const;

/** P1's turn: Jinx (5) in base, exhausted or not; `cards` junk cards in hand to pitch. */
function board(exhausted: boolean, cards: string[]) {
  let b = scenario().unit(P1, "base", JINX_REBEL, "jinx", { exhausted });
  for (const a of cards) {
    b = b.hand(P1, junk(a), a);
  }
  return b;
}

describe("Ruling 2abed520c3c0be67 — every discard triggers Jinx again; being ready already does not cancel the +1", () => {
  test("first discard: an exhausted Jinx is readied and gets +1 (5 → 6)", async () => {
    const game = await board(true, ["a", "b", "c"]).build();
    expect(game.state("jinx")).toMatchObject({ isReady: false, might: 5 });
    await game.p1.do("discardCard", { cardId: "a" });
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.state("jinx")).toMatchObject({ isReady: true, might: 6 });
  });

  test("ruling: a SECOND discard in the same turn triggers again — she is already ready, and still gets +1 (→ 7)", async () => {
    const game = await board(true, ["a", "b", "c"]).build();
    await game.p1.do("discardCard", { cardId: "a" });
    await game.settle();
    await game.p1.do("discardCard", { cardId: "b" });
    expect(game.chain().filter((c) => c.cardId === "jinx" && c.triggered)).toHaveLength(1);
    await game.settle();
    expect(game.state("jinx")).toMatchObject({ isReady: true, might: 7 });
  });

  test("ruling: a third discard keeps going — no once-per-turn cap (→ 8)", async () => {
    const game = await board(true, ["a", "b", "c"]).build();
    for (const c of ["a", "b", "c"]) {
      await game.p1.do("discardCard", { cardId: c });
      await game.settle();
    }
    expect(game.state("jinx")).toMatchObject({ isReady: true, might: 8 });
    expect(game.p1.hand()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("ruling: an already-READY Jinx still takes the +1 from a discard", async () => {
    const game = await board(false, ["a"]).build();
    expect(game.state("jinx")).toMatchObject({ isReady: true, might: 5 });
    await game.p1.do("discardCard", { cardId: "a" });
    await game.settle();
    expect(game.state("jinx")).toMatchObject({ isReady: true, might: 6 });
  });

  test("nuance: with no cards in hand there is nothing to discard, so the ability never activates", async () => {
    const game = await board(true, []).build();
    expect(game.p1.hand()).toEqual([]);
    await game.settle();
    expect(game.chain().filter((c) => c.cardId === "jinx" && c.triggered)).toHaveLength(0);
    expect(game.state("jinx")).toMatchObject({ isReady: false, might: 5 });
  });

  test("the accumulated Might is 'this turn' only — Jinx is back to 5 next turn", async () => {
    const game = await board(true, ["a", "b"]).build();
    for (const c of ["a", "b"]) {
      await game.p1.do("discardCard", { cardId: c });
      await game.settle();
    }
    expect(game.state("jinx").might).toBe(7);
    await game.advanceTurn();
    expect(game.state("jinx").might).toBe(5);
  });
});
