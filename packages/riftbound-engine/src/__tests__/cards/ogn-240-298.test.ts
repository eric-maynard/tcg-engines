/**
 * Sett, Kingpin — ogn-240-298 · Champion Unit (Sett) · Order · 4 energy + [order] · 5 Might
 *
 *   [Tank] (I must be assigned combat damage first.)
 *   I get +1 [Might] for each buffed friendly unit at my battlefield.
 *
 * Rules: 815 (Tank: lethal damage must be assigned to Tank units first), 740.1.a (friendly =
 * same controller). The bonus only counts buffed friendly units at the SAME battlefield as Sett —
 * not units in a base, at another battlefield, or enemy units — and is 0 while Sett is in base.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-240-298";

describe("Sett, Kingpin (ogn-240-298)", () => {
  test("costs 4 energy + 1 order; a 5-Might Tank unit that enters exhausted; unaffordable without the order power", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { order: 1 } }).hand(P1, CARD, "sett").build();
    await game.p1.play("sett");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("sett")).toBe("base");
    expect(game.state("sett").baseMight).toBe(5); // effective Might in base: see the "stays 5" BUG below
    expect(game.state("sett").keywords).toContain("Tank");
    expect(game.state("sett").isExhausted).toBe(true);
    const noPower = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "sett").build();
    expect(noPower.p1.can("play", "sett")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 3, power: { order: 1 } }).hand(P1, CARD, "sett").build();
    expect(lowEnergy.p1.can("play", "sett")).toBe(false);
  });

  test("[Tank]: a 3-Might attacker's damage must all go to Sett, sparing the 1-Might ally beside him", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Squire" }, "squire")
      .unit(P1, "bf1", CARD, "sett")
      .unit(P2, "base", { might: 3 }, "atk")
      .build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("squire")).toBe("battlefield-bf1");
    expect(game.zoneOf("sett")).toBe("battlefield-bf1");
    expect(game.state("sett").damage).toBe(0); // 3 < 5, healed in the combat cleanup
    expect(game.zoneOf("atk")).toBe("trash"); // took 5 + 1
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("+1 Might for EACH buffed friendly unit at his battlefield — two buffed allies there make him 7", async () => {
    // Expected: after Sett moves to bf1 where two buffed friendly units stand, his Might is 5+2 = 7.
    // Actual: the static's `per` clause is ignored — the engine applies a flat +1 (and only once a
    // state-based recalculation happens), so he reads 5 or 6.
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "sett")
      .unit(P1, "bf1", { might: 2 }, "a", { buffed: true })
      .unit(P1, "bf1", { might: 2 }, "b", { buffed: true })
      .build();
    expect(game.state("sett").might).toBe(5); // in base: no battlefield, no bonus
    await game.p1.move("sett", "bf1");
    expect(game.state("sett").might).toBe(7);
  });

  test("no bonus in base, from unbuffed allies, buffed units elsewhere, or buffed ENEMY units — he stays 5", async () => {
    // Expected: only buffed FRIENDLY units AT HIS battlefield count → 5 in every case here. Actual:
    // once statics are recalculated (any play does it) the engine adds an unconditional +1 → 6.
    const played = await scenario().resources(P1, { energy: 4, power: { order: 1 } }).unit(P1, "base", { might: 2 }, "homeBuffed", { buffed: true }).hand(P1, CARD, "sett").build();
    await played.p1.play("sett");
    await played.settle();
    expect(played.state("sett").might).toBe(5); // "my battlefield": in base he has none
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", CARD, "sett")
      .unit(P1, "bf1", { might: 2 }, "plainAlly")
      .unit(P1, "bf2", { might: 2 }, "farBuffed", { buffed: true })
      .unit(P1, "base", { might: 2 }, "homeBuffed", { buffed: true })
      .unit(P2, "bf1", { might: 2 }, "buffedFoe", { buffed: true })
      .hand(P1, { energyCost: 1, might: 1, name: "Cheap Recruit" }, "cheap")
      .build();
    await game.p1.play("cheap", { to: "base" });
    await game.settle();
    expect(game.state("sett").might).toBe(5);
  });

  test("the bonus matters in combat — defending beside two buffed 1-Might allies he is 7 and survives a 6-Might attacker", async () => {
    // Expected: Sett 5+2 = 7 > 6 damage (all on him via Tank) → he lives, allies untouched, the
    // attacker dies to 7+2+2. Actual: Sett fights at 5 and is killed.
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "sett")
      .unit(P1, "bf1", { might: 1 }, "a", { buffed: true })
      .unit(P1, "bf1", { might: 1 }, "b", { buffed: true })
      .unit(P2, "base", { might: 6 }, "atk")
      .build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.zoneOf("b")).toBe("battlefield-bf1");
    expect(game.zoneOf("sett")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
