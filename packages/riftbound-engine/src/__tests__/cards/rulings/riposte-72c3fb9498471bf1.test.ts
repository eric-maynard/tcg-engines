/**
 * Ruling 72c3fb9498471bf1 — Riposte (SFD-206 → sfd-206-221) · Reaction · [2][rainbow][rainbow] "Choose a friendly unit and a spell.
 *   Counter that spell and give that unit +[Might] equal to that spell's Energy cost this turn."
 *   × Yordle Explorer (SFD-100 → sfd-100-221) · 4 Might "When you play a card with Power cost [rainbow][rainbow] or more, draw 1."
 *   × Corina Veraza (SFD-179 → sfd-179-221) · 7+[order] · 6 Might "[Accelerate] ([1][order]) When I move to a battlefield, play three Recruits."
 *
 * Q: Does "cost" in card text mean the printed cost, or does it include additional / Repeat costs?
 * A: Printed cost only. Riposte's buff equals the countered spell's PRINTED energy cost, not what was paid with Repeat.
 *    Yordle Explorer does NOT trigger off an Accelerated Corina Veraza — her printed Power cost is one [order]; the
 *    Accelerate [order] is an additional cost.
 * Rules: 206.1 (a card's cost is its printed cost), 356.4 (additional costs), 820 (Repeat is an additional cost).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIPOSTE = "sfd-206-221";
const FRIGID_TOUCH = "sfd-066-221"; // Reaction · [2] · "[Repeat] [2] Give a unit -2 [Might] this turn."
const YORDLE_EXPLORER = "sfd-100-221";
const CORINA = "sfd-179-221";
const YASUO = "ogn-076-298"; // 6 + [calm][calm] · printed Power cost 2 · no play trigger

describe("Ruling 72c3fb9498471bf1 — 'cost' means printed cost (Riposte / Yordle Explorer)", () => {
  test("Riposte vs a Repeated Frigid Touch (printed [2], [4] actually paid): the spell is countered whole and the friendly unit gets exactly +2, not +4", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .resources(P2, { energy: 2, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
      .hand(P1, FRIGID_TOUCH, "ft")
      .hand(P2, RIPOSTE, "riposte")
      .build();
    await game.p1.cast("ft", { repeat: 1, targets: "guard" });
    expect(game.p1.energy()).toBe(0); // 2 printed + 2 Repeat were paid
    expect(game.chain().map((c) => c.cardId)).toEqual(["ft"]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.cast("riposte", { targets: "guard" }); // the lone spell on the chain is the forced spell choice
    expect(game.chain().map((c) => c.cardId)).toEqual(["ft", "riposte"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("riposte")).toBe("trash");
    expect(game.zoneOf("ft")).toBe("trash"); // countered → trash, no -2s applied
    expect(game.state("guard").might).toBe(7); // 5 + printed cost 2 (NOT 5 + 4, and no -4 from the countered Frigid Touch)
    expect(game.state("guard").mightModifier).toBe(2);
    expect(game.p1.energy()).toBe(0); // nothing refunded
    expect(game.violations()).toEqual([]);
  });

  test("control for Yordle Explorer: playing Yasuo (printed Power cost [calm][calm]) DOES draw 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { calm: 2 } })
      .unit(P1, "base", YORDLE_EXPLORER, "explorer")
      .hand(P1, YASUO, "yasuo")
      .build();
    const hand = game.p1.hand().length;
    await game.p1.play("yasuo");
    await game.settle();
    expect(game.zoneOf("yasuo")).toBe("base");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
  });

  test("Accelerated Corina Veraza (printed [7][order]; [1][order] more paid to Accelerate): total Power paid is 2 but printed Power cost is 1 → Yordle Explorer does NOT draw", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { order: 2 } })
      .unit(P1, "base", YORDLE_EXPLORER, "explorer")
      .hand(P1, CORINA, "corina")
      .build();
    const hand = game.p1.hand().length;
    await game.p1.play("corina", { accelerate: true });
    await game.settle();
    expect(game.zoneOf("corina")).toBe("base");
    expect(game.state("corina").isReady).toBe(true); // Accelerate was really paid
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("order")).toBe(0); // two [order] left the pool …
    expect(game.p1.hand()).toHaveLength(hand - 1); // … yet no draw: printed Power cost is a single [order]
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("likewise un-accelerated Corina (Power cost [order]) does not draw either — Accelerate never changes what Yordle Explorer reads", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { order: 1 } })
      .unit(P1, "base", YORDLE_EXPLORER, "explorer")
      .hand(P1, CORINA, "corina")
      .build();
    const hand = game.p1.hand().length;
    await game.p1.play("corina");
    await game.settle();
    expect(game.zoneOf("corina")).toBe("base");
    expect(game.state("corina").isExhausted).toBe(true);
    expect(game.p1.hand()).toHaveLength(hand - 1);
  });
});
