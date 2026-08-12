/**
 * Ruling f31ea0b413f396d8 — Void Burrower (SFD-187 → sfd-187-221) · Rek'Sai's legend
 *   "When you conquer, you may exhaust me to reveal the top 2 cards of your Main Deck. You may banish one, then play
 *    it. Recycle the rest."
 *
 * Q: When I use Void Burrower on a conquer, do I still pay for the card I choose to play?
 * A: Yes — in full. The ability never says "ignoring its cost", so playing the banished card is an ordinary play and
 *    its whole Energy and Power cost comes out of your pool. If you cannot pay, it is not a card you can play.
 * Rules: 355.1 (playing pays the full cost unless an effect says otherwise), 204 (costs), 383.3.b (the exhaust is the trigger's cost).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_BURROWER = "sfd-187-221";
const SKULKER = "ogn-175-298"; // Shipyard Skulker — [3], no Power cost, 3 Might
const CLEAVE = "ogn-004-298"; // [1] — the other revealed card

/** P1's turn. Rek'Sai's legend, a Runner to conquer with, and a known top-of-deck. */
function board(energy: number) {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Holder" }, "holder")
    .legend(P1, VOID_BURROWER, "reksai")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .deck(P1, [SKULKER, CLEAVE], ["skulker", "spell"])
    .resources(P1, { energy });
}

/** Conquer bf1 and accept the legend's ability. */
async function conquerAndAccept(energy: number): Promise<Game> {
  const game = await board(energy).build();
  await game.p1.move("runner", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "reksai" } });
  await game.p1.yes();
  await game.acting().passPriority();
  await game.acting().passPriority();
  return game;
}

describe("Ruling f31ea0b413f396d8 — Void Burrower does not discount the card you play; you pay its full cost", () => {
  test("accepting exhausts the legend and reveals the top 2, asking which to banish-and-play", async () => {
    const game = await conquerAndAccept(3);
    expect(game.state("reksai").isExhausted).toBe(true);
    const d = game.decision() as { options: { key: string }[] };
    expect(d.options.map((o) => o.key)).toContain("skulker");
  });

  test("playing the 3-cost unit drains the whole [3] from the pool", async () => {
    const game = await conquerAndAccept(3);
    expect(game.p1.energy()).toBe(3);
    await game.p1.pick("skulker");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // where does it enter play?
    await game.p1.pick("base");
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("with an empty pool the same card is NOT offered — the cost is not waived, so it cannot be played", async () => {
    const game = await conquerAndAccept(0);
    expect(game.p1.energy()).toBe(0);
    const d = game.decision();
    const keys = (d as { options?: { key: string }[] } | null)?.options?.map((o) => o.key) ?? [];
    expect(keys).not.toContain("skulker");
  });

  test("declining the whole ability leaves the legend ready and the deck untouched", async () => {
    const game = await board(3).build();
    await game.p1.move("runner", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.p1.no();
    await game.settle();
    expect(game.state("reksai").isExhausted).toBe(false);
    expect(game.zoneOf("skulker")).toBe("mainDeck");
    expect(game.p1.energy()).toBe(3);
  });
});
