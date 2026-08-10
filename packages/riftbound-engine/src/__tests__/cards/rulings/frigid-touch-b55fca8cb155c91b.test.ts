/**
 * Ruling b55fca8cb155c91b — Frigid Touch (SFD-066 → sfd-066-221) · Spell · Mind · 2 · [Reaction] [Repeat][2] "Give a unit -2 [Might] this turn."
 *   × Prodigal Explorer (SFD-199 → sfd-199-221, Ezreal legend) "[Exhaust]: [Reaction] — Draw 1. Use only if you've chosen
 *     enemy units and/or gear twice this turn with spells or unit abilities."
 *
 * Q: If I cast Frigid Touch with Repeat, can I exhaust the Ezreal legend?
 * A: Yes. One spell played with Repeat chooses a target twice (initial + repeated effect; same or different unit). Having
 *    chosen enemy units twice this turn satisfies Ezreal's condition — usable as soon as the spell is on the chain.
 * Rules: 820 (Repeat: additional cost, effect executed again with its own choices), 355 (targets chosen at play),
 *        Ezreal's "use only if" condition counts choices, not spells.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FRIGID_TOUCH = "sfd-066-221";
const PRODIGAL_EXPLORER = "sfd-199-221";

/** P1's turn: Ezreal legend (ready), Frigid Touch in hand, [4] = [2] + Repeat [2]. P2 has two 3-Might units in base; P1 has one of its own. */
function board() {
  return scenario()
    .legend(P1, PRODIGAL_EXPLORER, "ez")
    .resources(P1, { energy: 4 })
    .unit(P2, "base", { might: 3, name: "Foe A" }, "foeA")
    .unit(P2, "base", { might: 3, name: "Foe B" }, "foeB")
    .unit(P1, "base", { might: 3, name: "Mine" }, "mine")
    .hand(P1, FRIGID_TOUCH, "ft");
}

describe("Ruling b55fca8cb155c91b — Frigid Touch with Repeat on enemy units = two enemy choices → Ezreal legend turns on", () => {
  test("premise: before anything is chosen the legend's ability is not usable", async () => {
    const game = await board().build();
    expect(game.p1.can("activateAbility:ez#0")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "ez")).toBe(false);
  });

  test("control: Frigid Touch WITHOUT Repeat on one enemy unit is only ONE choice — the legend stays off (even after it resolves: Foe A 3 → 1)", async () => {
    const game = await board().build();
    await game.p1.cast("ft", { targets: ["foeA"] });
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("activateAbility:ez#0")).toBe(false);
    await game.settle();
    expect(game.state("foeA").might).toBe(1);
    expect(game.p1.can("activateAbility:ez#0")).toBe(false);
  });

  test("Frigid Touch paying Repeat, choosing Foe A then Foe B: ONE spell on the chain carrying two targets, [4] spent — and the legend is usable at once (Reaction, spell still on the chain)", async () => {
    const game = await board().build();
    await game.p1.cast("ft", { repeat: 1, targets: ["foeA", "foeB"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ft", controller: P1, targets: ["foeA", "foeB"], triggered: false })]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.p1.can("activateAbility:ez#0")).toBe(true);
  });

  test("activating it: the legend exhausts and P1 draws 1; then everything resolves — Foe A and Foe B each -2 (3 → 1)", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await game.p1.cast("ft", { repeat: 1, targets: ["foeA", "foeB"] });
    await game.p1.activate("ez", 0);
    expect(game.state("ez").isExhausted).toBe(true);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    expect(game.zoneOf("ft")).toBe("trash");
    expect(game.state("foeA")).toMatchObject({ might: 1, mightModifier: -2 });
    expect(game.state("foeB")).toMatchObject({ might: 1, mightModifier: -2 });
    expect(game.state("mine").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("choosing a FRIENDLY unit for one of the two executions is only one enemy choice — legend stays off", async () => {
    const game = await board().build();
    await game.p1.cast("ft", { repeat: 1, targets: ["foeA", "mine"] });
    expect(game.p1.can("activateAbility:ez#0")).toBe(false);
  });

  // Expected (ruling: "these can be the same unit or different units"): the two executions may both name Foe A, which is
  // still two enemy choices and enables the legend. Actual: the engine never offers the same unit for both executions
  // (targets options lack ["foeA","foeA"]) and rejects that cast.
  test.failing("BUG: ruling b55fca8cb155c91b — engine does not allow both Repeat executions of Frigid Touch to choose the SAME enemy unit", async () => {
    const game = await board().build();
    const offered = game.p1.option("cast", "ft")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(offered).toContainEqual(["foeA", "foeA"]);
    await game.p1.cast("ft", { repeat: 1, targets: ["foeA", "foeA"] });
    expect(game.p1.can("activateAbility:ez#0")).toBe(true);
    await game.settle();
    expect(game.state("foeA").mightModifier).toBe(-4);
  });
});
