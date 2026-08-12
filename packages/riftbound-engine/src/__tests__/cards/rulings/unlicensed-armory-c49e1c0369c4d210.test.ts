/**
 * Ruling c49e1c0369c4d210 — Unlicensed Armory (OGN-023 → ogn-023-298) · Gear · Fury · [2]
 *   "Discard 1, [Exhaust]: Choose a friendly unit. The next time it would die this turn, you may pay
 *    [fury] to heal it, exhaust it, and recall it instead."
 *
 * Q: Can I discard a card to Unlicensed Armory with no friendly units in play?
 * A: No. Anything that targets needs a legal target before you may activate it, even when the effect it
 *    sets up is itself optional. And you cannot activate it with an empty hand either — "Discard 1" is a
 *    cost, and an unpayable cost means the ability is simply unavailable.
 * Rules: 355.8/355.16 (no legal target ⇒ the ability cannot be activated), 357.3 (an unpayable cost is not
 *        offered), 204.3 (a cost is paid on activation, not on resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const UNLICENSED_ARMORY = "ogn-023-298";
const SPARE_CARD = "ogn-004-298"; // any card, purely as discard fodder

/** P1's turn. The Armory is ready on P1's board; an enemy unit is always present at bf1. */
function board(opts: { friendlyUnit: boolean; cardInHand: boolean }) {
  let b = scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .gear(P1, UNLICENSED_ARMORY, "armory");
  if (opts.friendlyUnit) {
    b = b.unit(P1, "base", { might: 3, name: "Ally" }, "ally");
  }
  if (opts.cardInHand) {
    b = b.hand(P1, SPARE_CARD, "spare");
  }
  return b;
}

describe("Ruling c49e1c0369c4d210 — Unlicensed Armory needs both a legal target and a card to discard", () => {
  test("ruling: with a card in hand but NO friendly unit, the ability cannot be activated — the enemy unit is no target", async () => {
    const game = await board({ cardInHand: true, friendlyUnit: false }).build();
    expect(game.p1.hand().length).toBe(1);
    expect(game.p1.units().length).toBe(0);
    expect(game.p1.can("activate", "armory")).toBe(false);
    const r = await game.p1.try((p) => p.activate("armory", 0, { targets: "foe" }));
    expect(r.ok).toBe(false);
    expect(game.state("armory").isExhausted).toBe(false);
    expect(game.p1.hand().length).toBe(1); // nothing was discarded
  });

  test("ruling: with a friendly unit but an EMPTY hand, the 'Discard 1' cost cannot be paid, so it is not available", async () => {
    const game = await board({ cardInHand: false, friendlyUnit: true }).build();
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.can("activate", "armory")).toBe(false);
    const r = await game.p1.try((p) => p.activate("armory", 0, { targets: "ally" }));
    expect(r.ok).toBe(false);
    expect(game.state("armory").isExhausted).toBe(false);
  });

  test("control: with both a friendly unit and a card in hand it is legal — the discard and the exhaust are paid", async () => {
    const game = await board({ cardInHand: true, friendlyUnit: true }).build();
    expect(game.p1.can("activate", "armory")).toBe(true);
    await game.p1.activate("armory", 0, { targets: "ally" });
    await game.settle();
    expect(game.state("armory").isExhausted).toBe(true);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.trash()).toContain("spare");
    expect(game.violations()).toEqual([]);
  });
});
