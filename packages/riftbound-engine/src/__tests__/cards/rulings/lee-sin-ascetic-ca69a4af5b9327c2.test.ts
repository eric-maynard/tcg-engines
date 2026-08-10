/**
 * Ruling ca69a4af5b9327c2 — Lee Sin, Ascetic (OGN-078 → ogn-078-298) · "[Exhaust]: Buff me. I can have any number of buffs."
 *   × Meditation (ogn-048-298) · Reaction [2] · "As an additional cost to play this, you may exhaust a friendly unit. If you do,
 *     draw 2. Otherwise, draw 1."
 *
 * Q: Can one exhaust of Lee Sin pay for BOTH Meditation's extra draw and Lee Sin's own "Exhaust: buff me"?
 * A: No. Both are costs; the same exhaust cannot pay two different costs. Exhausting him for Meditation draws 2 but gives no buff,
 *    and he is then unable to pay his own ability's cost (and vice versa).
 * Rules: 356.2 (additional costs are paid as the spell is played), 380.2 (an activated ability's cost must actually be paid),
 *        421 (exhausting an already-exhausted permanent is not a payment).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const LEE_SIN_ASCETIC = "ogn-078-298";
const MEDITATION = "ogn-048-298";
const EXHAUST_BUFF = 1; // ability index of "[Exhaust]: Buff me."

function board() {
  return scenario().resources(P1, { energy: 2 }).unit(P1, "base", LEE_SIN_ASCETIC, "lee").hand(P1, MEDITATION, "med");
}

describe("Ruling ca69a4af5b9327c2 — one exhaust of Lee Sin pays ONE cost: Meditation's or his own, never both", () => {
  test("exhausting Lee Sin as Meditation's additional cost: draw 2, Lee Sin exhausted but NOT buffed, no Lee Sin item on the chain, and his ability is now unpayable", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("med", { costs: { paid: { exhaust: "lee" } } });
    expect(game.state("lee").isExhausted).toBe(true); // paid as Meditation's cost
    expect(game.chain().map((c) => c.cardId)).toEqual(["med"]); // no Lee Sin activation rode along
    await game.settle();
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 2);
    expect(game.state("lee")).toMatchObject({ isBuffed: false, isExhausted: true, might: 5 });
    expect(game.p1.can("activate", "lee")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("the other way round: activating Lee Sin first (exhausted, buffed) leaves Meditation castable only WITHOUT its exhaust option on him — it draws just 1", async () => {
    const game = await board().build();
    await game.p1.activate("lee", EXHAUST_BUFF);
    await game.settle();
    expect(game.state("lee")).toMatchObject({ isBuffed: true, isExhausted: true, might: 6 });
    // Lee Sin (already exhausted) is not an eligible payer for Meditation's additional cost.
    const exhaustOptions = (game.p1.option("cast", "med")?.variants ?? [])
      .map((v) => (v.params.costs as { paid?: { exhaust?: unknown } } | undefined)?.paid?.exhaust)
      .filter((x) => x !== undefined && x !== false);
    expect(exhaustOptions.flat()).not.toContain("lee");
    const r = await game.p1.try((p) => p.cast("med", { costs: { paid: { exhaust: "lee" } } }));
    expect(r.ok).toBe(false);
    const handBefore = game.p1.hand().length;
    await game.p1.cast("med");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1);
    expect(game.state("lee").might).toBe(6); // still exactly one buff
  });
});
