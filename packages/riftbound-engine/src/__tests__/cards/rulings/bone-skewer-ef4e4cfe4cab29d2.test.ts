/**
 * Ruling ef4e4cfe4cab29d2 — Bone Skewer (UNL-139 → unl-139-219) · [Hidden] spell · [2][chaos]
 *   "Choose a battlefield. An opponent reveals their hand. You may choose a unit from it. They play that unit to that
 *    battlefield, ignoring any and all costs. When they do, [Stun] it."
 *
 * Q: If my opponent makes me play a unit to a battlefield with Bone Skewer, am I attacking?
 * A: Attacker/defender are COMBAT designations. Dropping a unit at a battlefield nobody contests starts a showdown but
 *    no combat, so the unit is not an attacker. If the battlefield already holds the caster's units, combat does start
 *    and the arriving unit — the one that applied Contested — carries the attacker designation, even though its
 *    controller never chose to attack.
 * Rules: 447.1 (combat needs opposing units), 437/459 (designations), 187.3.a.1 (arrival applies Contested),
 *        429.1 (a showdown is not a combat), 466.1.a.2 (an attacker with defenders still there is recalled).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BONE_SKEWER = "unl-139-219";
const SKULKER = "ogn-175-298"; // Shipyard Skulker — the 3-Might unit dragged out of P2's hand

/** P1's turn. P1 holds bf1; `guardAtBf1` decides whether P1 has a unit standing there. */
function board(guardAtBf1: boolean) {
  const b = scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .hand(P1, BONE_SKEWER, "skewer")
    .hand(P2, SKULKER, "victim")
    .resources(P1, { energy: 2, power: { chaos: 1 } });
  return guardAtBf1 ? b.unit(P1, "bf1", { might: 2, name: "Guard" }, "guard") : b.unit(P1, "base", { might: 2, name: "Guard" }, "guard");
}

/** Cast the Skewer at `battlefield` and make P2 put their unit there. */
async function skewer(battlefield: string, guardAtBf1: boolean): Promise<Game> {
  const game = await board(guardAtBf1).build();
  await game.p1.cast("skewer", { targets: battlefield });
  await game.acting().passPriority();
  await game.acting().passPriority();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // the CASTER chooses from the revealed hand
  await game.p1.pick("victim");
  return game;
}

describe("Ruling ef4e4cfe4cab29d2 — a unit Bone Skewer forces out is only an 'attacker' when it actually starts a combat", () => {
  test("to an EMPTY battlefield: the unit arrives (stunned) and has no combat designation at all", async () => {
    const game = await skewer("bf2", false);
    expect(game.locationOf("victim")).toBe("bf2");
    expect(game.state("victim")).toMatchObject({ combatRole: null, controller: P2, isStunned: true });
    expect(game.gameState.battlefields.bf2?.contested).toBe(true); // contested, but there is nobody to fight
  });

  test("to a battlefield the CASTER occupies: combat starts and the arriving unit is the attacker", async () => {
    const game = await skewer("bf1", true);
    expect(game.locationOf("victim")).toBe("bf1");
    expect(game.state("victim")).toMatchObject({ combatRole: "attacker", controller: P2, isStunned: true });
    expect(game.state("guard").combatRole).toBe("defender");
  });

  test("the showdown belongs to the unit's controller even though P1 cast the spell: P2 gets focus", async () => {
    const game = await skewer("bf1", true);
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
  });

  test("being [Stun]ned it deals no combat damage; with both sides left standing the attacker is recalled to base", async () => {
    const game = await skewer("bf1", true);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.locationOf("victim")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("nothing was paid for the unit: P2's pool is untouched and only the Skewer's [2][chaos] left P1's", async () => {
    const game = await skewer("bf1", true);
    expect(game.p2.energy()).toBe(0);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("chaos")).toBe(0);
    expect(game.zoneOf("skewer")).toBe("trash");
  });
});
