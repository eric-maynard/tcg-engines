/**
 * Ruling 2a640a2bd3812e97 — Charm (OGN-043 → ogn-043-298) · Calm · [1][calm] · "Move an enemy unit."
 *
 * Q: Player A holds a battlefield and Charms Player B's unit onto it, starting a showdown. Who attacks?
 * A: Player B — the unit's controller is the one who made the battlefield Contested, so B is the attacker
 *    and becomes the active player for the showdown; A, who controls the battlefield, is the defender, and
 *    B (the attacker) has Focus first even though it is A's turn.
 * Rules: 190.3.a / 450 (Contested is applied for the moved unit's controller), 442.1.a (attacker/defender),
 *        345 (Focus starts with the attacker).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";

/** P1's turn. P1 holds bf1 with a Warden standing there; P2's Pawn is at home; P1 has Charm. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Warden" }, "warden")
    .unit(P2, "base", { might: 2, name: "Pawn" }, "pawn")
    .hand(P1, CHARM, "charm");
}

/** P1 Charms P2's Pawn onto the battlefield P1 holds; the chain empties and the showdown opens. */
async function charmedOntoBf1(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("charm", { targets: "pawn", answers: ["bf1"] });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.locationOf("pawn")).toBe("bf1");
  return game;
}

describe("Ruling 2a640a2bd3812e97 — Charming an enemy unit onto your own battlefield makes THEM the attacker", () => {
  test("the moved unit's controller applied Contested, so P2 is the contesting player", async () => {
    const game = await charmedOntoBf1();
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.gameState.battlefields.bf1?.contestedBy).toBe(P2);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("ruling: P2's Pawn is the ATTACKER and P1's Warden — the battlefield holder — is the DEFENDER", async () => {
    const game = await charmedOntoBf1();
    expect(game.state("pawn").combatRole).toBe("attacker");
    expect(game.state("warden").combatRole).toBe("defender");
  });

  test("ruling: the attacker acts first in the showdown — the decision is P2's even though it is P1's turn", async () => {
    const game = await charmedOntoBf1();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
    expect(game.actingSeat()).toBe(P2);
  });

  test("epilogue: the 4-Might defender beats the 2-Might attacker; P1 keeps bf1 and scores nothing for defending", async () => {
    const game = await charmedOntoBf1();
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
