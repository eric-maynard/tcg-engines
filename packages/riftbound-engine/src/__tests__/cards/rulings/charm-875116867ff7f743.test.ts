/**
 * Ruling 875116867ff7f743 — Charm (OGN-043 → ogn-043-298) · Spell · Calm · [1][calm] · "Move an enemy unit."
 *
 * Q: I Charm an enemy unit onto a battlefield I control. Am I the attacker or the defender?
 * A: The defender. Who attacks is decided by whose units applied the Contested status, not by who cast the spell
 *    that moved them. The enemy unit arrived at your battlefield, so its controller is the attacker.
 * Rules: 445 (the controller of the units that applied Contested is the attacker), 344 (Contested ⇒ showdown),
 *        446.1 (an effect-caused move is still a move).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";

/** P1's turn with exactly [1][calm]. P1 holds bf1 with a Guard; P2's Foe waits in P2's base. */
function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
    .hand(P1, CHARM, "charm");
}

async function charmIn(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("charm", { answers: ["bf1"], targets: "foe" });
  await game.acting().passPriority();
  await game.acting().passPriority();
  return game;
}

describe("Ruling 875116867ff7f743 — Charming an enemy onto your own battlefield makes THEM the attacker", () => {
  test("the charmed unit arrives at bf1 and a showdown opens there", async () => {
    const game = await charmIn();
    expect(game.locationOf("foe")).toBe("bf1");
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "showdown" });
  });

  test("the enemy unit applied Contested, so it is the ATTACKER — casting the spell does not make P1 one", async () => {
    const game = await charmIn();
    expect(game.state("foe").combatRole).toBe("attacker");
  });

  test("…and P1's unit, sitting on the battlefield P1 controls, is the DEFENDER", async () => {
    const game = await charmIn();
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("the combat then plays out with those roles: the 5-Might defender kills the 3-Might attacker", async () => {
    const game = await charmIn();
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
