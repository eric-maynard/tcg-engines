/**
 * Ruling 3e779a33e0b17fb1 — Gust (ogn-169-298) × Pyke, Dockside Butcher (unl-028-219)
 *   Gust: "[Reaction] Return a unit at a battlefield with 3 [Might] or less to its owner's hand." (1)
 *   Pyke: 2 Might, "[Hidden] [Ganking] You may pay [fury] as an additional cost to play me. When you play me, if you paid the
 *          additional cost, ready me and give me +2 [Might] this turn."
 *
 * Q: Can you Gust Pyke after the opponent plays him from hidden and pays the additional [fury]?
 * A: Yes. Playing from hidden puts Pyke on the battlefield and his "when you play me" trigger on the chain; that closed state
 *    is a Reaction window. Gust (on top) resolves first and returns the still-2-Might Pyke to hand; the trigger then resolves
 *    with Pyke gone and grants nothing.
 * Rules: 811.1.b (play from Hidden), 330–334 / 404.1 (LIFO), triggers whose source left the board do nothing.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PYKE = "unl-028-219";
const GUST = "ogn-169-298";

/** P2's turn 3; P2 controls bf1 (a Holder stands there). P1 holds Gust with 1 energy. */
function base() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 2, name: "Other" }, "other")
    .hand(P1, GUST, "gust");
}

/** From "Pyke is at bf1 with his paid trigger on the chain": P1 Gusts him in that window; assert the ruling's outcome. */
async function gustInResponseToPykeTrigger(game: Game): Promise<void> {
  expect(game.zoneOf("pyke")).toBe("battlefield-bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pyke", triggered: true })]);
  expect(game.state("pyke")).toMatchObject({ isReady: false, might: 2 }); // the pump has NOT resolved yet
  expect(game.p2.power("fury")).toBe(0); // the additional cost was paid
  if (game.decision()?.seat === P2) {
    await game.p2.passPriority();
  }
  // Closed state → P1's Reaction window; the 2-Might Pyke at a battlefield is a legal Gust target.
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options).toContainEqual(["pyke"]);
  await game.p1.cast("gust", { targets: "pyke" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["pyke", "gust"]);
  await game.settle();
  // LIFO: Gust bounced Pyke; his trigger then found nothing to ready/pump.
  expect(game.zoneOf("pyke")).toBe("hand");
  expect(game.p2.hand()).toContain("pyke");
  expect(game.state("pyke").might).toBe(2);
  expect(game.zoneOf("gust")).toBe("trash");
  expect(game.chain()).toEqual([]);
  expect(game.p2.power("fury")).toBe(0); // no refund of the additional cost
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  expect(game.violations()).toEqual([]);
}

describe("Ruling 3e779a33e0b17fb1 — Gust answers Pyke's paid 'when you play me' trigger and bounces him before it resolves", () => {
  test("ruling 3e779a33e0b17fb1 — engine's play-from-Hidden (revealHidden) never offers Pyke's own optional [fury] additional cost, so the paid-from-hidden line cannot be reproduced", async () => {
    // Expected: P2 flips the hidden Pyke for [0] AND may pay [fury]; Pyke enters bf1 with his trigger on the chain; P1 Gusts him
    // in response; Pyke → hand at 2 Might, trigger does nothing.
    // Actual: revealHidden exposes no pay-the-additional-cost variant (only granted-Accelerate is modelled) and rejects
    // paidAdditionalCost, so Pyke can only be flipped unpaid (no trigger at all).
    const game = await base().resources(P2, { power: { fury: 1 } }).facedown(P2, "bf1", PYKE, "pyke").build();
    expect(game.p2.can("reveal", "pyke")).toBe(true);
    await game.p2.reveal("pyke", { payOptional: true });
    await gustInResponseToPykeTrigger(game);
  });

  test("same chain mechanics with Pyke played from HAND paying [fury] to bf1: trigger on the chain → P1 Gusts in response → Pyke returns to hand un-pumped, trigger fizzles", async () => {
    const game = await base().resources(P2, { energy: 3, power: { fury: 1 } }).hand(P2, PYKE, "pyke").build();
    await game.p2.play("pyke", { payOptional: true, to: "bf1" });
    await gustInResponseToPykeTrigger(game);
  });

  test("control: if P1 lets the trigger resolve, the paid Pyke is readied and pumped to 4 — and is then too big for Gust", async () => {
    const game = await base().resources(P2, { energy: 3, power: { fury: 1 } }).hand(P2, PYKE, "pyke").build();
    await game.p2.play("pyke", { payOptional: true, to: "bf1" });
    if (game.decision()?.seat === P2) {
      await game.p2.passPriority();
    }
    await game.p1.passPriority();
    await game.settle();
    expect(game.state("pyke")).toMatchObject({ isReady: true, might: 4 });
    expect(game.locationOf("pyke")).toBe("bf1");
    expect(game.p1.can("cast", "gust")).toBe(false); // open state on P2's turn, and Pyke is 4 > 3 anyway
  });
});
