/**
 * Ruling 4872ae2737cd35c4 — (no specific card) what "[Add]" means.
 *   Exercised with a Gold gear token (UNL-t05) "[Reaction][>] Kill this, [Exhaust]: [Add] [rainbow].
 *   (Abilities that add resources can't be reacted to.)" and Dragonsoul Sage (UNL-093 → unl-093-219)
 *   "[Reaction][>] [Exhaust]: [Add] [1]."
 *
 * Q: What does "add" mean on a Riftbound card?
 * A: [Add] puts the named resource straight into your pool — you exhaust (and here also kill) the
 *    card and spend what it produced on a cost, WITHOUT recycling a rune to make that Power. The
 *    rune pool is untouched, unlike the ordinary recycle-a-rune route.
 * Rules: 429 (Add abilities produce resources), 204.4 (paying from the pool), 419.2.b (Add abilities
 *        cannot be reacted to).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const GOLD = "unl-t05";
const DRAGONSOUL_SAGE = "unl-093-219";

/** A base-speed spell whose cost is a single [rainbow] Power pip and no Energy. */
const WARD = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Test Ward",
  powerCost: ["rainbow"],
  rulesText: "Deal 1 to a unit.",
  timing: "standard",
} as const;

/** P1 with two ready runes, a Gold token, a target and the [rainbow] spell. */
function board() {
  return scenario()
    .runes(P1, "fury", 2)
    .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
    .gear(P1, GOLD, "gold")
    .hand(P1, WARD, "ward");
}

describe("Ruling 4872ae2737cd35c4 — [Add] puts the resource in your pool without recycling a rune", () => {
  test("with an empty pool the [rainbow] spell is unaffordable; activating the Gold adds the Power and makes it playable", async () => {
    const game = await board().build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.can("cast", "ward")).toBe(false);
    await game.p1.activate("gold");
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.p1.can("cast", "ward")).toBe(true);
    await game.p1.cast("ward", { targets: "ally" });
    await game.settle();
    expect(game.p1.power("rainbow")).toBe(0); // spent on the cost
    expect(game.state("ally").damage).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("the cost is exhausting (and here killing) the card — the RUNE POOL is left completely alone", async () => {
    const game = await board().build();
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    await game.p1.activate("gold");
    expect(game.p1.runes()).toHaveLength(2); // no rune recycled…
    expect(game.p1.runes({ ready: true })).toHaveLength(2); // …and none exhausted either
    expect(game.zoneOf("gold")).toBe("gone"); // the token killed itself as its own cost
  });

  test("contrast: making the same Power the ordinary way COSTS a rune from the pool", async () => {
    const game = await board().build();
    await game.p1.recycleRune(undefined, "fury");
    expect(game.p1.power("fury")).toBe(1);
    expect(game.p1.runes()).toHaveLength(1); // the rune is gone from the pool
    expect(game.zoneOf("gold")).toBe("base"); // …and the Gold is still there, unused
  });

  test("[Add] also produces Energy, not only Power: Dragonsoul Sage's '[Exhaust]: [Add] [1]' fills the pool by exhausting itself", async () => {
    const game = await scenario()
      .runes(P1, "fury", 2)
      .unit(P1, "base", DRAGONSOUL_SAGE, "sage")
      .build();
    expect(game.p1.energy()).toBe(0);
    await game.p1.activate("sage");
    expect(game.p1.energy()).toBe(1);
    expect(game.state("sage").isExhausted).toBe(true);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.violations()).toEqual([]);
  });
});
