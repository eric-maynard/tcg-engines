/**
 * Ruling 8169e8120a3c985b — Grand Strategem (OGN-233 → ogn-233-298) · Spell · Order · 6 + [order]x3 · [Action]
 *     "Give friendly units +5 [Might] this turn."
 *
 * Q: Does the +5 affect units played AFTER the spell resolves?
 * A: No. "Give" is a one-shot effect applied to the friendly units on the board at the moment the spell resolves; the
 *    spell then goes to the trash. Units that enter play later this turn get nothing — it is not a continuous aura.
 * Rules: 153 (a spell resolves, creates its effect, goes to trash), 359 (resolution snapshot), "this turn" expiry (317.2).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GRAND_STRATEGEM = "ogn-233-298";
const LATECOMER = { cardType: "unit", domain: "order", energyCost: 1, might: 2, name: "Latecomer" } as const;

function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { order: 3 } }) // 6 + [order]x3 for the spell, 1 for the Latecomer
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", { might: 2, name: "Home Guard" }, "home")
    .unit(P1, "bf1", { might: 3, name: "Field Guard" }, "field")
    .unit(P2, "base", { might: 4, name: "Enemy" }, "foe")
    .hand(P1, GRAND_STRATEGEM, "gs")
    .hand(P1, LATECOMER, "late");
}

describe("Ruling 8169e8120a3c985b — Grand Strategem only pumps the friendly units in play when it resolves", () => {
  test("on resolution every friendly unit on the board (base and battlefield) gets +5 this turn; the enemy does not; the spell goes to the trash", async () => {
    const game = await board().build();
    await game.p1.cast("gs");
    await game.settle();
    expect(game.zoneOf("gs")).toBe("trash");
    expect(game.state("home").might).toBe(7);
    expect(game.state("field").might).toBe(8);
    expect(game.state("foe").might).toBe(4);
  });

  test("a friendly unit played AFTER the spell resolved enters at its printed Might — no +5 (not a continuous effect)", async () => {
    const game = await board().build();
    await game.p1.cast("gs");
    await game.settle();
    expect(game.zoneOf("gs")).toBe("trash");
    await game.p1.play("late", { to: "base" });
    await game.settle();
    expect(game.zoneOf("late")).toBe("base");
    expect(game.state("late").might).toBe(2);
    expect(game.state("late").mightModifier).toBe(0);
    // the earlier recipients keep theirs
    expect(game.state("home").might).toBe(7);
    expect(game.state("field").might).toBe(8);
    expect(game.violations()).toEqual([]);
  });

  test("'this turn': the +5 lapses at end of turn", async () => {
    const game = await board().build();
    await game.p1.cast("gs");
    await game.settle();
    await game.advanceTurn();
    expect(game.state("home").might).toBe(2);
    expect(game.state("field").might).toBe(3);
  });
});
