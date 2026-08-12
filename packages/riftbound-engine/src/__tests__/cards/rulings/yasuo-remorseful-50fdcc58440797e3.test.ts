/**
 * Ruling 50fdcc58440797e3 — Yasuo, Remorseful (ogn-076-298) · Unit/Champion · Calm · [6][calm][calm] · 6 Might
 *   "When I attack, deal damage equal to my Might to an enemy unit here."
 *
 * Q: Yasuo attacks a battlefield defended by the opposing Yasuo. Does the attack trigger kill the
 *    defender before combat damage, or do they trade?
 * A: The attacking Yasuo's trigger resolves during the showdown, long before the Damage Step, and kills
 *    the defending Yasuo. No combat damage is exchanged between them. The combat still happens (it
 *    matters for effects that care about winning a combat) — there is simply nobody left to hit back.
 * Rules: 464.2.e (attack triggers go on the initial combat chain), 340.1 (they resolve during the
 *        showdown), 465.2 (Damage Step comes after the showdown closes), 466.3/466.5.d (result, Conquer).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";

function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", YASUO, "theirs")
    .unit(P1, "base", YASUO, "mine");
}

describe("Ruling 50fdcc58440797e3 — Yasuo's attack trigger kills before the Damage Step", () => {
  test("the attack trigger is on the chain before any combat damage; nothing is damaged yet", async () => {
    const game = await board().build();
    await game.p1.move("mine", "bf1");
    expect(game.chain().map((i) => i.cardId)).toEqual(["mine"]);
    expect(game.chain()[0]).toMatchObject({ triggered: true });
    expect(game.state("theirs").damage).toBe(0);
    expect(game.state("mine").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.showdownComplete).not.toBe(true);
  });

  test("it resolves for 6 (its Might) and kills the defending Yasuo while the showdown is still open", async () => {
    const game = await board().build();
    await game.p1.move("mine", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority(); // the attack trigger resolves
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.state("mine").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.showdownComplete).not.toBe(true); // combat has not resolved
    expect(game.gameState.interaction?.showdownStack?.at(-1)?.active).toBe(true);
  });

  test("no combat damage is exchanged: the attacker ends the combat unharmed and conquers bf1", async () => {
    const game = await board().build();
    await game.p1.move("mine", "bf1");
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("battlefield-bf1");
    expect(game.state("mine").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("the combat itself still happened — the battlefield ran its combat resolution, not a non-combat close", async () => {
    const game = await board().build();
    await game.p1.move("mine", "bf1");
    expect(game.gameState.interaction?.showdownStack?.at(-1)?.isCombatShowdown).toBe(true);
    await game.settle();
    expect(game.gameState.battlefields.bf1?.showdownComplete).toBe(true);
    expect(game.gameState.battlefields.bf1?.combatCleanupLog).toBeDefined();
    expect(game.violations()).toEqual([]);
  });

  test("contrast — without the trigger the two 6-Might units would have traded: a vanilla 6-Might attacker and the defending Yasuo both die", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", YASUO, "theirs")
      .unit(P1, "base", { might: 6, name: "Brute" }, "brute")
      .build();
    await game.p1.move("brute", "bf1");
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
  });
});
