/**
 * Ruling ed270f8c294230fe — Deceiver (UNL-199 → unl-199-219) · LeBlanc's legend
 *   "When you conquer or hold, you may discard 1 and exhaust me to play a ready Reflection unit token there.
 *    It becomes a copy of another unit there. Give it [Temporary]."
 *
 * Q: With no cards in hand, do I still have to discard to put LeBlanc's ability on the Chain?
 * A: The discard is part of the ability's COST, and a cost must be payable in full. With an empty hand you cannot pay
 *    it, so the "you may" is never even offered — the ability does not go on the Chain at all.
 * Rules: 422.3 (discard as a cost must be completable), 404.2 (an unpayable cost ⇒ the item is removed unasked),
 *        383.3.a/b + 204.3.a ("you may [cost] to …" is decided and paid at finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DECEIVER = "unl-199-219";
const FILLER = "ogn-175-298";

/** P1's turn, LeBlanc's legend in play, one unit ready in base, bf1 empty and uncontrolled. */
function board(withCardInHand: boolean) {
  const b = scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Holder" }, "holder")
    .legend(P1, DECEIVER, "leblanc")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner");
  return withCardInHand ? b.hand(P1, FILLER, "spare") : b;
}

/** Conquer the empty battlefield and let the non-combat showdown close. */
async function conquer(withCardInHand: boolean): Promise<Game> {
  const game = await board(withCardInHand).build();
  await game.p1.move("runner", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  return game;
}

describe("Ruling ed270f8c294230fe — LeBlanc's discard is a cost: an empty hand means the ability is never offered", () => {
  test("with a card in hand the conquer offers the ability, naming its cost", async () => {
    const game = await conquer(true);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "leblanc" } });
    expect(d?.prompt).toContain("discard");
    expect(game.chain().map((c) => c.cardId)).toEqual(["leblanc"]);
  });

  test("accepting pays BOTH cost parts — the card is discarded and the legend exhausts — and the token arrives", async () => {
    const game = await conquer(true);
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("spare")).toBe("trash");
    expect(game.state("leblanc").isExhausted).toBe(true);
    expect(game.p1.hand()).toEqual([]);
    const tokens = game.p1.units("bf1").filter((u) => u !== "runner");
    expect(tokens).toHaveLength(1);
    expect(game.state(tokens[0] as string).keywords).toContain("Temporary");
    expect(game.violations()).toEqual([]);
  });

  test("with an EMPTY hand the cost is unpayable, so nothing is asked and no Chain item is created", async () => {
    const game = await conquer(false);
    expect(game.p1.hand()).toEqual([]);
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect(game.chain()).toEqual([]);
  });

  test("…and nothing happens: the legend stays ready and no Reflection token is made", async () => {
    const game = await conquer(false);
    await game.settle();
    expect(game.state("leblanc").isExhausted).toBe(false);
    expect(game.p1.units("bf1")).toEqual(["runner"]);
    expect(game.p1.points()).toBe(1); // the conquer itself still scored
  });

  test("declining while you COULD pay leaves hand, legend and battlefield untouched", async () => {
    const game = await conquer(true);
    await game.p1.no();
    await game.settle();
    expect(game.p1.hand()).toEqual(["spare"]);
    expect(game.state("leblanc").isExhausted).toBe(false);
    expect(game.p1.units("bf1")).toEqual(["runner"]);
  });
});
