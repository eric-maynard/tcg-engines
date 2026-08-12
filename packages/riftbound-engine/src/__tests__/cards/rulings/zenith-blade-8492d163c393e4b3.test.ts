/**
 * Ruling 8492d163c393e4b3 — Zenith Blade (OGN-262 → ogn-262-298) · Spell · Calm/Order · [3][rainbow][rainbow] · [Action]
 *     "Stun an enemy unit at a battlefield. You may move a friendly unit to that enemy unit's battlefield."
 *
 * Q: The opponent walks into an OPEN battlefield (a non-combat showdown) and I answer with Zenith Blade, moving my unit
 *    in and staging combat — who is attacker and who is defender?
 * A: The opponent, who moved in first and applied Contested, is the ATTACKER; the unit that arrives afterwards defends.
 *    The non-combat showdown ends with no conquer for them (they are no longer the only player with units there) and
 *    the combat showdown starts immediately.
 * Rules: 464.2 (the player who staged the showdown / applied Contested attacks), 348.2 (a non-combat showdown closes
 *        without a conquer when both players have units there), 355.1.b ([Action] playable in showdowns).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZENITH_BLADE = "ogn-262-298";

/** P2's turn. bf1 is open (nobody controls it, nobody is there). P1 waits in base with a Guard and Zenith Blade. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .unit(P1, "base", { might: 6, name: "Guard" }, "guard")
    .hand(P1, ZENITH_BLADE, "blade");
}

/** P2 walks into the open bf1, opening a NON-combat showdown, then passes Focus to P1. */
async function nonCombatShowdown(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  const sd = game.gameState.interaction?.showdownStack ?? [];
  expect(sd[0]).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: false });
  expect(game.state("raider").combatRole).toBeNull(); // no designations in a non-combat showdown
  if (game.decision()?.seat === P2) {
    await game.p2.passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 8492d163c393e4b3 — the player who moved in first is the attacker in the combat Zenith Blade stages", () => {
  test("the opening move is a non-combat showdown at the open battlefield — nobody has a combat designation yet", async () => {
    const game = await nonCombatShowdown();
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.can("cast", "blade")).toBe(true);
  });

  test("ruling 8492d163c393e4b3 — Zenith Blade stuns the Raider and brings the Guard in: P2's Raider is the ATTACKER and P1's arriving Guard is the DEFENDER", async () => {
    const game = await nonCombatShowdown();
    // Both objects — the stun victim and the friendly mover — are named on the play.
    const pairs = (game.p1.option("cast", "blade")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
    expect(pairs).toContainEqual(["raider", "guard"]);
    await game.p1.cast("blade", { targets: ["raider", "guard"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // where the Guard goes
    await game.p1.pick("battlefield-bf1");
    expect(game.locationOf("guard")).toBe("bf1");
    expect(game.state("raider")).toMatchObject({ combatRole: "attacker", isStunned: true });
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.gameState.interaction?.showdownStack?.[0]).toMatchObject({
      attackingPlayer: P2,
      battlefieldId: "bf1",
      defendingPlayer: P1,
      isCombatShowdown: true,
    });
  });

  test("the non-combat showdown gives P2 nothing (they are no longer alone there) and the combat then plays out with the stunned Raider dealing no damage", async () => {
    const game = await nonCombatShowdown();
    await game.p1.cast("blade", { targets: ["raider", "guard"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.p2.points()).toBe(0); // no conquer out of the non-combat showdown
    expect(game.zoneOf("raider")).toBe("trash"); // 6 from the Guard
    expect(game.state("guard").damage).toBe(0); // stunned units deal no combat damage
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // P1 is the one left standing
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
