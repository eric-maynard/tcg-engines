/**
 * Ruling 9cbb19725b8d1689 — Daughter of the Void (OGN-247 → ogn-247-298, Kai'Sa Legend)
 *   "[Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play spells."
 *
 * Q: Can Energy and Power be "stacked up" (floated) in the rune pool, including Power from
 *    Kai'Sa's Legend ability?
 * A: Yes. Unspent Energy and Power sit in your rune pool for the rest of the turn and accumulate
 *    from every source; the pool is only emptied at the end of the turn. Adding resources does not
 *    use the chain, so nobody can react to it. Kai'Sa's Power is earmarked though: it may only pay
 *    for spells.
 * Rules: 162.3 / 430.4 (the rune pool retains unspent Energy and Power), 317.2 step 3e (the pool
 *        is emptied in the Ending Phase), 416.2 / 429.3 ("Add" finalizes at once — no chain),
 *        429.4 ("use only to play spells" earmarks the resource).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DAUGHTER_OF_THE_VOID = "ogn-247-298";

const GRUNT = { cardType: "unit", domain: "fury", energyCost: 0, might: 3, name: "Test Grunt", powerCost: ["fury"] } as const;

/** "Deal 1 to a unit." for [0] + [fury] — a spell the earmarked Power may pay for. */
const SPARK = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Spark",
  powerCost: ["fury"],
  rulesText: "Deal 1 to a unit.",
} as const;

/** P1's turn, empty pools, the Kai'Sa Legend ready, and three ready fury runes to draw on. */
const board = () =>
  scenario()
    .legend(P1, DAUGHTER_OF_THE_VOID, "legend")
    .runes(P1, "fury", 3)
    .unit(P2, "base", { might: 5, name: "Target Dummy" }, "dummy");

describe("Ruling 9cbb19725b8d1689 — Energy and Power float in the pool and accumulate", () => {
  test("Kai'Sa's [Add] resolves at once and puts Power in the pool — no chain item, nothing to react to", async () => {
    const game = await board().build();
    expect(game.p1.resources()).toMatchObject({ energy: 0 });
    await game.p1.activate("legend", 0);
    expect(game.chain()).toEqual([]); // an "Add" never uses the chain
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.state("legend").isExhausted).toBe(true);
  });

  test("the added Power floats: it is still in the pool after unrelated actions later in the turn", async () => {
    const game = await board().build();
    await game.p1.activate("legend", 0);
    await game.p1.tapRune();
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.power("rainbow")).toBe(1);
    await game.p1.tapRune();
    expect(game.p1.energy()).toBe(2); // Energy stacks up too
    expect(game.p1.power("rainbow")).toBe(1);
  });

  test("Power from different sources stacks in the same pool", async () => {
    const game = await board().build();
    await game.p1.activate("legend", 0);
    await game.p1.recycleRune(game.p1.runes({ ready: true })[0] as string, "fury");
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.p1.power("fury")).toBe(1);
  });

  test("the earmark is real: the floated [rainbow] pays a SPELL's Power cost", async () => {
    const game = await board().hand(P1, SPARK, "spark").build();
    await game.p1.activate("legend", 0);
    await game.p1.cast("spark", { targets: "dummy" });
    await game.settle();
    expect(game.state("dummy").damage).toBe(1);
    expect(game.p1.power("rainbow")).toBe(0);
  });

  test("…but not a UNIT's: with only the earmarked [rainbow] in the pool, the unit is unplayable", async () => {
    const game = await board().hand(P1, GRUNT, "grunt").build();
    await game.p1.activate("legend", 0);
    expect(game.p1.power("rainbow")).toBe(1);
    const denied = await game.p1.try((p) => p.play("grunt"));
    expect(denied.ok).toBe(false);
    expect(game.zoneOf("grunt")).toBe("hand");
  });

  test("floating lasts for the turn, not beyond: the pool is emptied in the Ending Phase", async () => {
    const game = await board().build();
    await game.p1.activate("legend", 0);
    await game.p1.tapRune();
    expect(game.p1.resources()).toMatchObject({ energy: 1 });
    await game.advanceTurn();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
