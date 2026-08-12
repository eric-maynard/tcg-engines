/**
 * Ruling 73bd0ef4b6a98ee6 — Charm (OGN-043 → ogn-043-298) · Spell · Calm · [1][calm]
 *   "Move an enemy unit."
 *
 * Q: When I Charm an enemy unit into my own backfield (a battlefield I hold), who is the attacker?
 * A: The Charmed enemy unit is the attacker. The Attacker designation follows the unit that ARRIVES and applies
 *    Contested — its controller — not the player who cast the spell that moved it.
 * Rules: 450 (the arriving unit's controller applies Contested and is the Attacker), 464.2.c.3 (attacker/defender
 *        designations when the combat showdown opens), 449 (an effect may move any unit it names).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1's turn with exactly [1][calm]. P1 durably holds bf1 with a 5-Might Guard; bf2 is open (so the destination is a real
 *  choice); P2's 3-Might Intruder waits in P2's base. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 3, name: "Intruder" }, "intruder")
    .hand(P1, CHARM, "charm");
}

describe("Ruling 73bd0ef4b6a98ee6 — a Charmed enemy dragged into my battlefield is the ATTACKER", () => {
  test("premise: before the Charm nobody is designated and P1 holds bf1", async () => {
    const game = await board().build();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.state("intruder").combatRole).toBeNull();
    expect(game.state("guard").combatRole).toBeNull();
  });

  test("ruling: Charming the Intruder onto bf1 makes IT the attacker (and P2 the attacking player) even though P1 cast the spell — P1's Guard is the defender", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "intruder" });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    await game.p1.pick("battlefield-bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("intruder")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("intruder").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
  });

  test("and the roles decide the combat: the attacking Intruder (3) dies to the defending Guard (5), P1 keeps bf1 with no conquer", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "intruder", answers: ["battlefield-bf1"] });
    await game.settle();
    expect(game.zoneOf("intruder")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1"); // 3 < 5: the defender survives (and is healed at end of combat)
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0); // a successful DEFENCE is not a conquer
    expect(game.violations()).toEqual([]);
  });
});
