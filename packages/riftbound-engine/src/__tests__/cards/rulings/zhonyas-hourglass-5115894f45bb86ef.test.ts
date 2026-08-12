/**
 * Ruling 5115894f45bb86ef — Zhonya's Hourglass (OGN-077 → ogn-077-298)
 *   "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × The Boss (OGN-269 → ogn-269-298) "If a buffed unit you control would die, you may pay
 *     [rainbow], exhaust me, and SPEND ITS BUFF to heal it, exhaust it, and recall it instead."
 *     (the "revive that eats the buff" the ruling contrasts with)
 *
 * Q: When a unit with boosts is returned to base by Zhonya's (or revived by a Sett-style passive),
 *    does it keep its boosts?
 * A: Yes. Modifications are only stripped when an object changes zones to/from a non-board zone; a
 *    recall keeps the unit on the board, so boosts (and debuffs) ride along. Only what the effect
 *    itself removes is lost — a revive that SPENDS the buff loses the buff, and nothing else.
 * Rules: 149 (recall stays on the board), 179 (modifications end on a zone change off the board),
 *        703 (buff), 702.2.b (spending a buff removes one buff counter).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const THE_BOSS = "ogn-269-298";

/** Base-speed "Deal 20 to a unit." — lethal to anything here. */
const SMITE = {
  abilities: [{ effect: { amount: 20, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Smite",
  rulesText: "Deal 20 to a unit.",
  timing: "standard",
} as const;

describe("Ruling 5115894f45bb86ef — a recall keeps the unit on the board, so its boosts survive", () => {
  test("Zhonya's recall preserves the +2 boost AND the buff; only the damage is healed", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Hero" }, "hero", { buffed: true, mightModifier: 2 })
      .gear(P1, ZHONYAS, "hourglass")
      .hand(P1, SMITE, "smite")
      .build();
    expect(game.state("hero").might).toBe(6); // 3 printed + 1 buff + 2 boost
    await game.p1.cast("smite", { targets: "hero" });
    await game.settle();
    expect(game.zoneOf("hourglass")).toBe("trash"); // the gear died in its place
    expect(game.locationOf("hero")).toBe("base");
    expect(game.state("hero").damage).toBe(0);
    expect(game.state("hero").isBuffed).toBe(true);
    expect(game.state("hero").mightModifier).toBe(2);
    expect(game.state("hero").might).toBe(6); // unchanged by the trip to base
    expect(game.violations()).toEqual([]);
  });

  test("a DEBUFF rides along too — negative modifications are not cleaned up by the recall", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5, name: "Hero" }, "hero", { mightModifier: -2 })
      .gear(P1, ZHONYAS, "hourglass")
      .hand(P1, SMITE, "smite")
      .build();
    await game.p1.cast("smite", { targets: "hero" });
    await game.settle();
    expect(game.locationOf("hero")).toBe("base");
    expect(game.state("hero").mightModifier).toBe(-2);
    expect(game.state("hero").might).toBe(3);
  });

  test("a revive that SPENDS the buff loses exactly the buff — the boost is untouched", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Hero" }, "hero", { buffed: true, mightModifier: 2 })
      .unit(P1, "bf1", THE_BOSS, "boss")
      .hand(P1, SMITE, "smite")
      .build();
    await game.p1.cast("smite", { targets: "hero" });
    await game.settle();
    // The costed die-replacement is offered to the Hero's controller (371.2).
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.locationOf("hero")).toBe("base");
    expect(game.state("hero").isBuffed).toBe(false); // the buff was the cost
    expect(game.state("hero").mightModifier).toBe(2); // the boost stayed
    expect(game.state("hero").might).toBe(5); // 3 printed + 2 boost
    expect(game.state("hero").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("the boost is still a 'this turn' effect — it lapses at the Expiration Step, not at the recall", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Hero" }, "hero", { mightModifier: 2 })
      .gear(P1, ZHONYAS, "hourglass")
      .hand(P1, SMITE, "smite")
      .build();
    await game.p1.cast("smite", { targets: "hero" });
    await game.settle();
    expect(game.state("hero").mightModifier).toBe(2);
    await game.advanceTurn();
    expect(game.state("hero").mightModifier).toBe(0);
    expect(game.state("hero").might).toBe(3);
  });
});
