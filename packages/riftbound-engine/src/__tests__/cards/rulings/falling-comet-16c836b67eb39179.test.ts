/**
 * Ruling 16c836b67eb39179 — Falling Comet (OGN-085 → ogn-085-298) · Spell · [Action] · [5]
 *     "Deal 6 to a unit at a battlefield."
 *   × Sunlit Guardian (OGN-054 → ogn-054-298) · 3 Might · "[Shield] [Tank]"
 *
 * Q: Does [Tank] only matter in combat? With two enemy units at a battlefield, must Falling Comet be aimed at
 *    the [Tank] unit first?
 * A: No. [Tank] is short for "I must be assigned lethal damage before any other unit with my controller that
 *    lacks [Tank] during the COMBAT DAMAGE step" — it constrains nothing else. Falling Comet is a spell, so its
 *    6 damage is not combat damage: either unit at the battlefield is a legal choice, [Tank] or not.
 * Rules: 815.1.b ([Tank] = combat-damage assignment order only), 465 (Combat Damage step),
 *        355.8/355.14 (a spell's target is any legal candidate the caster picks), 714 (damage from effects).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FALLING_COMET = "ogn-085-298";
const SUNLIT_GUARDIAN = "ogn-054-298";

/** P1's turn with exactly [5]. P2 holds bf1 with a [Tank] Sunlit Guardian (3) and a vanilla Scout (3). */
function board() {
  return scenario()
    .resources(P1, { energy: 5 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", SUNLIT_GUARDIAN, "guardian")
    .unit(P2, "bf1", { might: 3, name: "Scout" }, "scout")
    .hand(P1, FALLING_COMET, "comet");
}

describe("Ruling 16c836b67eb39179 — [Tank] does not steer spell damage", () => {
  test("the Guardian really does have [Tank] (and [Shield]) — the premise of the question", async () => {
    const game = await board().build();
    expect(game.state("guardian").keywords).toEqual(expect.arrayContaining(["Shield", "Tank"]));
    expect(game.state("scout").keywords).not.toContain("Tank");
  });

  test("Falling Comet offers BOTH units at the battlefield: the non-[Tank] Scout is a legal target with the [Tank] Guardian standing right there", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "comet")?.fields.find((f) => f.name === "targets");
    expect((targets?.options ?? []).flat()).toEqual(expect.arrayContaining(["guardian", "scout"]));
    expect(game.p1.can("cast", "comet")).toBe(true);
  });

  test("aiming it at the Scout works: the Scout takes 6 and dies; the [Tank] Guardian is untouched and P2 keeps bf1", async () => {
    const game = await board().build();
    await game.p1.cast("comet", { targets: "scout" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "comet", controller: P1, targets: ["scout"] })]);
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.state("guardian")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("aiming it at the Guardian instead is equally legal (nothing forces or forbids either) — 6 kills the 3-Might Guardian, Scout untouched", async () => {
    const game = await board().build();
    await game.p1.cast("comet", { targets: "guardian" });
    await game.settle();
    expect(game.zoneOf("guardian")).toBe("trash");
    expect(game.state("scout")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — in the Combat Damage step [Tank] DOES bind: a 4-Might attacker's damage must go lethally to the Guardian first, so the Scout takes none", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", SUNLIT_GUARDIAN, "guardian")
      .unit(P2, "bf1", { might: 3, name: "Scout" }, "scout")
      .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p1.move("raider", "bf1");
    expect(game.state("guardian").might).toBe(4); // 3 + [Shield] while defending
    await game.settle();
    expect(game.zoneOf("guardian")).toBe("trash"); // took the whole 4 (lethal) first
    expect(game.zoneOf("raider")).toBe("trash"); // 4 + 3 back
    expect(game.state("scout")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
