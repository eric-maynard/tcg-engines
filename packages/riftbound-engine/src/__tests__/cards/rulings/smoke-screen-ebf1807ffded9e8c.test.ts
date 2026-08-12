/**
 * Ruling ebf1807ffded9e8c — Smoke Screen (OGN-093 → ogn-093-298) · 2 + [mind]
 *   "[Reaction] Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   × Defiant Dance (sfd-196-221) "+2 [Might] to a unit and -2 [Might] to another, this turn."
 *   × Baron Nashor (unl-147-219) "Other friendly units have +2 [Might]." (a passive in the snapshot)
 *
 * Q: How do later Might changes interact with a "to a minimum of 1" reduction?
 * A: The reduction is SNAPSHOT at resolution: the unit's current Might (passives included) fixes how
 *    big the minus actually is, and that fixed amount then applies for the rest of the turn. Later
 *    bonuses stack on top of it rather than being swallowed by the minimum.
 *      3 Might → -2 (down to 1); then +2 ⇒ 3 Might.
 *      2 base + 2 passive = 4 Might → -3 (down to 1); then +2 ⇒ 3 Might, the -3 still there.
 * Rules: 355 (the amount is computed as the effect resolves), 702/703 (Might modifiers are additive
 *        for the rest of the turn).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const DEFIANT_DANCE = "sfd-196-221";
const BARON_NASHOR = "unl-147-219";

/** `withBaron` adds the +2-to-others passive so the snapshot has to include it. */
function board(opts: { allyMight: number; withBaron?: boolean }) {
  let s = scenario()
    .resources(P1, { energy: 3, power: { mind: 1, rainbow: 1 } })
    .unit(P1, "base", { might: opts.allyMight, name: "Ally" }, "ally")
    .unit(P1, "base", { might: 5, name: "Other" }, "other")
    .hand(P1, SMOKE_SCREEN, "smoke")
    .hand(P1, DEFIANT_DANCE, "dance");
  if (opts.withBaron) {
    s = s.unit(P1, "base", BARON_NASHOR, "baron");
  }
  return s;
}

describe("Ruling ebf1807ffded9e8c — Smoke Screen's minimum-1 reduction is snapshot as a fixed amount", () => {
  test("a 3-Might unit is reduced BY 2 (not by 4): Might 1, modifier -2", async () => {
    const game = await board({ allyMight: 3 }).build();
    await game.p1.cast("smoke", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(1);
    expect(game.state("ally").mightModifier).toBe(-2);
  });

  test("adding +2 afterwards gives 3 Might — the -2 stays constant instead of the minimum re-clamping to 1", async () => {
    const game = await board({ allyMight: 3 }).build();
    await game.p1.cast("smoke", { targets: "ally" });
    await game.settle();
    await game.p1.cast("dance", { targets: ["ally", "other"] });
    await game.settle();
    expect(game.state("ally").might).toBe(3);
    expect(game.state("ally").mightModifier).toBe(0); // -2 then +2
    expect(game.violations()).toEqual([]);
  });

  test("passives are part of the snapshot: 2 base + Baron's +2 = 4 Might is reduced BY 3", async () => {
    const game = await board({ allyMight: 2, withBaron: true }).build();
    expect(game.state("ally").might).toBe(4);
    expect(game.state("ally").staticMightBonus).toBe(2);
    await game.p1.cast("smoke", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(1);
    expect(game.state("ally").mightModifier).toBe(-3);
  });

  test("that -3 keeps applying while other modifiers change: +2 afterwards leaves the unit at 3 Might with the -3 intact", async () => {
    const game = await board({ allyMight: 2, withBaron: true }).build();
    await game.p1.cast("smoke", { targets: "ally" });
    await game.settle();
    await game.p1.cast("dance", { targets: ["ally", "other"] });
    await game.settle();
    expect(game.state("ally").might).toBe(3); // 2 base + 2 passive - 3 + 2
    expect(game.state("ally").mightModifier).toBe(-1); // -3 then +2 — the snapshot never grew back
    expect(game.violations()).toEqual([]);
  });

  test("the whole reduction is 'this turn' — the unit is back to its ordinary Might next turn", async () => {
    const game = await board({ allyMight: 3 }).build();
    await game.p1.cast("smoke", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(1);
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(3);
    expect(game.state("ally").mightModifier).toBe(0);
  });
});
