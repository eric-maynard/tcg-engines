/**
 * Ruling 8b590a19313592be — Hextech Ray (OGN-009 → ogn-009-298) · Spell · Fury · [1][fury] · [Action]
 *     "Deal 3 to a unit at a battlefield."
 *
 * Q: If I Hextech Ray an enemy unit outside of combat, does it heal before I attack it, or does the damage stay?
 * A: The damage stays marked. Casting a spell starts a chain, not a showdown, and nothing heals on the spot.
 *    When you then attack that unit, combat damage is added to the damage already marked. Units heal at the end
 *    of each combat and at the end of the turn — not immediately after taking damage.
 * Rules: 142.3 (damage stays marked until healed), 338.1 (playing a spell creates a chain, not a showdown),
 *        461.1.a.1 (heal in the Combat Cleanup), 143.3.b / 317.2 (heal in the Ending Phase).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";

/** P1's turn. P2 holds bf1 with a 6-Might Ogre; P1 has a 3-Might Raider in base and Hextech Ray + [1][fury]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Ogre" }, "ogre")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, HEXTECH_RAY, "ray");
}

/** Cast the Ray at the Ogre and let it resolve. */
async function ray(game: Game): Promise<void> {
  await game.p1.cast("ray", { targets: "ogre" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("ray")).toBe("trash");
}

describe("Ruling 8b590a19313592be — spell damage stays marked; no heal before combat", () => {
  test("the spell only makes a chain — no showdown is started and the battlefield is not contested", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "ogre" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P1, triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.state("ogre").combatRole).toBeNull();
  });

  test("after it resolves the Ogre simply sits there with 3 damage marked — nothing heals it, and we are back in an open main phase", async () => {
    const game = await board().build();
    await ray(game);
    expect(game.state("ogre")).toMatchObject({ damage: 3, might: 6, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("attacking it next: the 3 spell damage is STILL on it when combat damage lands, so 3 + 3 = 6 kills the 6-Might Ogre", async () => {
    const game = await board().build();
    await ray(game);
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("ogre")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash"); // the Ogre dealt its 6 back
    expect(game.violations()).toEqual([]);
  });

  test("control — without the spell the same attack does not kill it: 3 combat damage on a 6-Might Ogre, and that combat damage is healed off at the end of the combat", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("ogre")).toBe("battlefield-bf1");
    expect(game.state("ogre").damage).toBe(0); // healed in the Combat Cleanup
    expect(game.zoneOf("raider")).toBe("trash");
  });

  test("and if no combat happens at all, the marked damage survives the whole turn and is healed only in the Ending Phase", async () => {
    const game = await board().build();
    await ray(game);
    expect(game.state("ogre").damage).toBe(3);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("ogre").damage).toBe(0);
  });
});
