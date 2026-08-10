/**
 * Ruling 0e1b6fb6cc9ffe81 — Charm (OGN-043 → ogn-043-298) · Spell · Calm · [1][calm] · "Move an enemy unit."
 *
 * Q: I Charm an enemy unit into a battlefield I control and the combat ends without a winner ("a tie") — whose unit
 *    recalls? Who is attacker / defender?
 * A: The opponent's unit is the ATTACKER (it applied Contested by arriving at a battlefield you control) and you DEFEND —
 *    the Charm player does not become the attacker for having caused the move. If defenders remain, the attacker
 *    recalls. Had the attacking unit won, its controller would conquer and score.
 * Rules: 190.3 / 450 (the arriving unit's controller applies Contested), 464.2.c (attacker = whose units applied
 *        Contested; defender = the controller), 466.1.a.2 (attackers recalled if defenders remain), 466.5 (conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";

/** P1's turn with [1][calm]. P1 holds bf1 with Mine (3). P2's Theirs sits in P2's base (6 Might; `stunned` so the fight has no winner). */
function board(theirs: { might: number; stunned: boolean }) {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 3, name: "Mine" }, "mine")
    .unit(P2, "base", { might: theirs.might, name: "Theirs" }, "theirs", theirs.stunned ? { stunned: true } : undefined)
    .hand(P1, CHARM, "charm");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Cast Charm on Theirs choosing bf1, and let it resolve (P2 passes). Stops in the combat showdown at bf1. */
async function charmIntoBf1(theirs: { might: number; stunned: boolean }): Promise<Game> {
  const game = await board(theirs).build();
  await game.p1.cast("charm", { targets: "theirs" });
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 }); // the Charm player picks where it goes
  expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toContain("battlefield-bf1");
  await game.p1.pick("battlefield-bf1");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Charm resolves
  expect(game.zoneOf("charm")).toBe("trash");
  expect(game.locationOf("theirs")).toBe("bf1");
  return game;
}

describe("Ruling 0e1b6fb6cc9ffe81 — a Charmed-in enemy unit is the attacker; you defend; no winner → the attacker recalls", () => {
  test("roles: Theirs applied Contested to P1's bf1 → contestedBy P2; the combat showdown has P2 ATTACKING (Theirs = attacker, P2 holds Focus first) and P1 DEFENDING (Mine = defender) — on P1's own turn", async () => {
    const game = await charmIntoBf1({ might: 6, stunned: true });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(showdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("theirs")).toMatchObject({ combatRole: "attacker", controller: P2 });
    expect(game.state("mine").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("no winner (stunned Theirs deals nothing; Mine's 3 doesn't kill a 6): defenders remain → the ATTACKER — the opponent's unit — is recalled to P2's base; Mine stays, P1 keeps bf1, no points either way", async () => {
    const game = await charmIntoBf1({ might: 6, stunned: true });
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.state("theirs")).toMatchObject({ controller: P2, damage: 0, owner: P2, zone: "base" });
    expect(game.p2.units("base")).toContain("theirs");
    expect(game.zoneOf("mine")).toBe("battlefield-bf1");
    expect(game.state("mine").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance: had the attacking unit won (un-stunned 6 vs 3) P2 CONQUERS bf1 and scores 1 — during P1's turn", async () => {
    const game = await charmIntoBf1({ might: 6, stunned: false });
    expect(game.state("theirs").combatRole).toBe("attacker");
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.locationOf("theirs")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P1);
  });
});
