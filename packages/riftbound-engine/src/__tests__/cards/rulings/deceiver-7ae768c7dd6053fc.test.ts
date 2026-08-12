/**
 * Ruling 7ae768c7dd6053fc — Deceiver (UNL-199 → unl-199-219) · Legend (LeBlanc)
 *   "When you conquer or hold, you may discard 1 and exhaust me to play a ready Reflection unit token
 *    there. It becomes a copy of another unit there. Give it [Temporary]."
 *
 * Q: With no cards in hand, can LeBlanc use Deceiver on Hold — using the card she is about to draw?
 * A: No. "Discard 1 and exhaust me" is the ability's COST; a cost must be payable in full at the moment
 *    you choose to use the ability. With an empty hand it cannot be paid, so the ability cannot be used at
 *    all — and no later draw can retroactively pay it.
 * Rules: 204.3.a / 383.3.b (a leading "you may [cost] to …" is the trigger's base cost, paid at
 *        finalization), 404.2 / 402.4 (an unpayable / objectless cost removes the item), 205 (costs).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DECEIVER = "unl-199-219";

/** P1's turn. LeBlanc is P1's legend; bf1 is open, and a Runner is ready to walk in and conquer it. */
function board() {
  return scenario().legend(P1, DECEIVER, "leblanc").battlefield("bf1", { controller: null }).unit(P1, "base", { might: 2, name: "Runner" }, "runner");
}

const reflections = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) => game.p1.units("bf1").filter((u) => u !== "runner");

describe("Ruling 7ae768c7dd6053fc — Deceiver's discard is a cost: with an empty hand the ability is simply unavailable", () => {
  test("empty hand: the conquer happens, but nothing is ever offered — no discard, no exhaust, no Reflection token", async () => {
    const game = await board().build();
    expect(game.p1.hand()).toHaveLength(0);

    await game.p1.move("runner", "bf1");
    const stop = await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);

    expect(stop.reason).toBe("open"); // no yes/no ever surfaced
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("leblanc").isExhausted).toBe(false);
    expect(reflections(game)).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control — exactly one card in hand: now the cost is payable, LeBlanc asks, and paying it discards that card, exhausts her and makes the Reflection", async () => {
    const game = await board().hand(P1, { cardType: "unit", energyCost: 1, might: 2, name: "Spare" }, "spare").build();
    await game.p1.move("runner", "bf1");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });

    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("spare")).toBe("trash"); // the discard, paid as a cost
    expect(game.state("leblanc").isExhausted).toBe(true);
    expect(game.p1.hand()).toHaveLength(0);
    expect(reflections(game)).toHaveLength(1);
  });

  test("the token is only ever paid for once: with the hand emptied by that first use, a second conquer offers nothing", async () => {
    const game = await board().hand(P1, { cardType: "unit", energyCost: 1, might: 2, name: "Spare" }, "spare").battlefield("bf2", { controller: null }).unit(P1, "base", { might: 2, name: "Runner 2" }, "runner2").build();
    await game.p1.move("runner", "bf1");
    await game.settle();
    await game.p1.yes();
    await game.settle();
    expect(game.p1.hand()).toHaveLength(0);

    await game.p1.move("runner2", "bf2");
    const stop = await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(stop.reason).toBe("open");
    expect(game.p1.units("bf2")).toEqual(["runner2"]);
  });
});
