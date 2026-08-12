/**
 * Ruling 51ede96fb580cc54 — Charm (ogn-043-298) · Spell · Calm · [1][calm] — "Move an enemy unit."
 *
 * Q: When you move a unit with Charm to your battlefield, who is the defender?
 * A: You are the defender. The unit you dragged in belongs to your opponent, so THEIR unit applies the
 *    Contested status — its controller becomes the attacker, and you (whose battlefield it is) defend.
 * Rules: 190.3.a / 450 (a unit becoming present applies Contested for its CONTROLLER), 464.2.c.1
 *        (attacker = the player whose units applied Contested), 464.2.c.2 (defender = the other player),
 *        345 (the contesting player gains Focus).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1 holds bf1 with a Guard; P2's Intruder sits in their base; P1 has Charm and the [1][calm] to cast it. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 3, name: "Intruder" }, "intruder")
    .hand(P1, CHARM, "charm");
}

/** P1 charms the enemy Intruder onto their own battlefield. */
async function charmed(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("charm", { answers: ["bf1"], targets: "intruder" });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Charm resolves; the arrival contests bf1 and opens the showdown
  return game;
}

describe("Ruling 51ede96fb580cc54 — Charming an enemy unit onto YOUR battlefield makes you the defender", () => {
  test("the charmed unit's controller (the opponent) is the ATTACKER and the Charm caster is the DEFENDER", async () => {
    const game = await charmed();
    expect(game.locationOf("intruder")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.contestedBy).toBe(P2);
    expect(showdown(game)).toMatchObject({
      active: true,
      attackingPlayer: P2,
      battlefieldId: "bf1",
      defendingPlayer: P1,
      isCombatShowdown: true,
    });
    expect(game.state("intruder").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
  });

  test("Focus goes to the attacker — the opponent whose unit was dragged in — even though the caster started it all (345)", async () => {
    const game = await charmed();
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
  });

  test("the combat that follows is a defence: the defender's 5-Might Guard kills the 3-Might attacker, no conquer, bf1 stays P1's with no point scored", async () => {
    const game = await charmed();
    await game.settle();
    expect(game.zoneOf("intruder")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
