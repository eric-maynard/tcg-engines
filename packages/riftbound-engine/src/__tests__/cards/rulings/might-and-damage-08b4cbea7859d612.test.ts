/**
 * Ruling 08b4cbea7859d612 — (general rules question, no specific card) Might vs damage vs "health"
 *   Witness cards: Iron Ballista (ogn-017-298) "[Exhaust]: Deal 2 to a unit at a battlefield." and The List (unl-138-219)
 *   "As you play this, name a tag. [Exhaust]: Give a unit with the named tag -2 [Might] this turn."
 *
 * Q: If I reduce a unit's Might, does that reduce its "health" and its damage? And damage marked on a unit doesn't reduce
 *    the damage it deals, right?
 * A: There is no separate health stat. Damage is MARKED on a unit and never lowers its Might: a 7-Might unit with 6 damage
 *    still deals 7 in combat. A unit dies when marked damage ≥ its current Might. Reducing Might lowers both what it deals
 *    and its kill threshold: 4 Might with damage marked, reduced to 2 → it dies at once if damage ≥ 2.
 * Rules: 141 / 141.2 (damage is marked, does not change Might), 142.2.a (dies when damage ≥ Might, checked at Cleanups),
 *        443.1 / 465 (combat damage dealt = current Might).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const IRON_BALLISTA = "ogn-017-298";
const THE_LIST = "unl-138-219";

describe("Ruling 08b4cbea7859d612 §1 — marked damage does not reduce Might or the damage a unit deals", () => {
  test("a 7-Might Veteran carrying 6 damage still reads 7 Might", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 7, name: "Veteran" }, "veteran", { damage: 6 })
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .build();
    expect(game.state("veteran")).toMatchObject({ baseMight: 7, damage: 6, might: 7 });
  });

  test("…and deals the full 7 in combat: attacking a 6-Might Wall kills it (had it dealt only 7−6 = 1 the Wall would live); the Veteran, taking 6 on top of its 6, dies too (12 ≥ 7)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 7, name: "Veteran" }, "veteran", { damage: 6 })
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .build();
    await game.p1.move("veteran", "bf1");
    expect(game.state("veteran")).toMatchObject({ combatRole: "attacker", damage: 6, might: 7 });
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash"); // took 7 ≥ 6
    expect(game.zoneOf("veteran")).toBe("trash"); // 6 marked + 6 taken ≥ 7
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });
});

describe("Ruling 08b4cbea7859d612 §2 — a unit dies only when marked damage reaches its CURRENT Might", () => {
  test("Ballista's 2 on a 4-Might unit: 2 < 4, it lives with 2 marked and still 4 Might (damage counts UP toward Might, no health bar)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .gear(P1, IRON_BALLISTA, "ballista")
      .unit(P2, "bf1", { might: 4, name: "Poro Brute", tags: ["Poro"] }, "brute")
      .build();
    await game.p1.activate("ballista", undefined, { targets: "brute" });
    await game.settle();
    expect(game.state("brute")).toMatchObject({ damage: 2, might: 4, zone: "battlefield-bf1" });
  });
});

describe("Ruling 08b4cbea7859d612 §3 — reducing Might lowers both damage output and the kill threshold", () => {
  /** P1's turn: ready Ballista, The List in hand + [1]. P2's Poro Brute (4, tag Poro) at P2's bf1; P2's Wall (3) with it. */
  function board() {
    return scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .gear(P1, IRON_BALLISTA, "ballista")
      .hand(P1, THE_LIST, "list")
      .unit(P2, "bf1", { might: 4, name: "Poro Brute", tags: ["Poro"] }, "brute");
  }

  test("survivability: Brute (4) with 2 damage marked, then The List gives it -2 → Might 2 with 2 damage → it dies immediately at the next Cleanup (no new damage needed)", async () => {
    const game = await board().build();
    await game.p1.play("list");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "name", seat: P1 });
    await game.p1.name("Poro");
    await game.settle();
    await game.p1.activate("ballista", undefined, { targets: "brute" });
    await game.settle();
    expect(game.state("brute")).toMatchObject({ damage: 2, might: 4 });
    await game.p1.activate("list", undefined, { targets: "brute" });
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the order is irrelevant and reduction is not damage: -2 first (Might 2, damage 0 — alive), then Ballista's 2 ≥ 2 kills it", async () => {
    const game = await board().build();
    await game.p1.play("list");
    await game.settle();
    await game.p1.name("Poro");
    await game.settle();
    await game.p1.activate("list", undefined, { targets: "brute" });
    await game.settle();
    expect(game.state("brute")).toMatchObject({ damage: 0, might: 2, zone: "battlefield-bf1" }); // lower Might alone kills nothing
    await game.p1.activate("ballista", undefined, { targets: "brute" });
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
  });

  test("damage output: a Brute reduced to 2 Might deals only 2 in combat — P1's 3-Might Scout attacking it survives (2 < 3) and kills it (3 ≥ 2)", async () => {
    const game = await board().unit(P1, "base", { might: 3, name: "Scout" }, "scout").build();
    await game.p1.play("list");
    await game.settle();
    await game.p1.name("Poro");
    await game.settle();
    await game.p1.activate("list", undefined, { targets: "brute" });
    await game.settle();
    expect(game.state("brute").might).toBe(2);
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
    expect(game.state("scout").damage).toBe(0); // took 2 (< 3), healed in the combat cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
