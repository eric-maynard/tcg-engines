/**
 * Ruling 38f28796d3dbe800 — Anivia, Primal (OGN-148 → ogn-148-298)
 *   "When I attack, deal 3 to all enemy units here." (8 Might champion)
 *   × a facedown [Hidden] card at the defender's battlefield (Teemo, Strategist — ogn-121-298).
 *
 * Q: Does Anivia's attack damage land before or after combat damage, and does it hit hidden units?
 * A: The "When I attack" trigger goes on the INITIAL chain of the combat showdown, so its 3 damage is
 *    dealt before any combat damage. A facedown card is not a unit at the battlefield and takes
 *    nothing — unless its controller plays it in response to the trigger, in which case it is there
 *    when the trigger resolves and takes the 3. Damage is marked, it does not lower Might.
 * Rules: 459.2.d.1 (attack triggers on the initial chain), 465 (Damage Step comes later),
 *        143.2.a (marked damage vs Might), 811.1 (facedown cards are not units).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ANIVIA = "ogn-148-298";
const TEEMO = "ogn-121-298"; // a 2-Might [Hidden] unit, hidden at bf1

/** P2 holds bf1 with two 3-Might Guards and a facedown [Hidden] card; P1 attacks with Anivia. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard A" }, "g1")
    .unit(P2, "bf1", { might: 3, name: "Guard B" }, "g2")
    .facedown(P2, "bf1", TEEMO, "hidden")
    .unit(P1, "base", ANIVIA, "anivia");
}

async function attack(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("anivia", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "anivia", controller: P1, triggered: true })]);
  return game;
}

describe("Ruling 38f28796d3dbe800 — Anivia's attack trigger resolves on the initial chain, before combat damage", () => {
  test("the trigger sits on the initial chain: nothing is damaged while it is unresolved", async () => {
    const game = await attack();
    expect(game.state("g1").damage).toBe(0);
    expect(game.state("g2").damage).toBe(0);
    expect(game.state("anivia").damage).toBe(0);
    expect(game.zoneOf("hidden")).toBe("facedown-bf1");
  });

  test("3 damage lands on every enemy unit at bf1 and kills both 3-Might Guards — the facedown card takes nothing", async () => {
    const game = await attack();
    await game.p1.passPriority();
    await game.p2.passPriority(); // the attack trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("g1")).toBe("trash");
    expect(game.zoneOf("g2")).toBe("trash");
    // Anivia has taken nothing yet — combat damage has not been dealt.
    expect(game.state("anivia").damage).toBe(0);
    expect(game.state("anivia").might).toBe(8);
    // The hidden card is not a unit at the battlefield: no damage, still facedown.
    expect(game.zoneOf("hidden")).toBe("facedown-bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // Anivia conquers
    expect(game.violations()).toEqual([]);
  });

  test("if the defender plays the hidden card in RESPONSE to the trigger, it is at the battlefield when the 3 lands and dies to it", async () => {
    const game = await attack();
    await game.p1.passPriority();
    expect(game.p2.can("revealHidden", "hidden")).toBe(true);
    await game.p2.reveal("hidden");
    expect(game.locationOf("hidden")).toBe("bf1");
    expect(game.state("hidden").might).toBe(2);
    await game.settle();
    expect(game.zoneOf("hidden")).toBe("trash"); // 3 ≥ 2 Might
    expect(game.violations()).toEqual([]);
  });

  test("damage is MARKED, it does not lower Might: a 5-Might Guard survives the 3 and still fights at 5", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Big Guard" }, "big")
      .unit(P1, "base", ANIVIA, "anivia")
      .build();
    await game.p1.move("anivia", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("big").damage).toBe(3);
    expect(game.state("big").might).toBe(5);
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    await game.settle();
    // Combat damage then finishes it: 8 ≥ 5, and the 5 back is not lethal to an 8-Might Anivia.
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("anivia")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });
});
