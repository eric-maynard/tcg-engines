/**
 * Ruling a8b2950d931a87c7 — Charm (OGN-043 → ogn-043-298) · spell · Calm · [1][calm] · "Move an enemy unit."
 *   (Ride the Wind OGN-173 is cited only for the contrasting "you moved first" case.)
 *
 * Q: When Charm moves an enemy unit to a battlefield I control, is that unit the attacker or the defender?
 * A: The attacker. It moved in and applied Contested to a battlefield you control — whatever effect caused the move —
 *    so a combat opens with the Charmed unit attacking and your units there defending.
 * Rules: 181.4 / 459 (a unit arriving at an enemy-controlled battlefield contests it), 462–464 (combat: the contesting
 *        side attacks, the controller defends), 140 (a move is a move regardless of its cause).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";

/** P1's turn. P1 controls bfMine with Guard (4). P2's Runner (3) sits at P2's bfTheirs; P2 also has a Homebody in base. P1: Charm + [1][calm]. */
function board() {
  return scenario()
    .battlefield("bfMine", { controller: P1 })
    .battlefield("bfTheirs", { controller: P2 })
    .unit(P1, "bfMine", { might: 4, name: "Guard" }, "guard")
    .unit(P2, "bfTheirs", { might: 3, name: "Runner" }, "runner")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "home")
    .hand(P1, CHARM, "charm")
    .resources(P1, { energy: 1, power: { calm: 1 } });
}

const openShowdown = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).find((s) => s.active);

/** P1 Charms the Runner to bfMine; both pass; Charm resolves. */
async function charmedIn(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("charm", { targets: "runner" });
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  await game.p1.pick("battlefield-bfMine");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "charm", controller: P1, targets: ["runner"] })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("charm")).toBe("trash");
  return game;
}

describe("Ruling a8b2950d931a87c7 — a unit Charmed onto a battlefield you control is the ATTACKER", () => {
  test("Charm resolves: the Runner is now at bfMine, bfMine is contested BY P2, and a COMBAT showdown is open with P2 attacking and P1 defending", async () => {
    const game = await charmedIn();
    expect(game.locationOf("runner")).toBe("bfMine");
    expect(game.gameState.battlefields.bfMine).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(openShowdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bfMine", defendingPlayer: P1, isCombatShowdown: true });
  });

  test("roles: the Charmed Runner is the attacker, my Guard the defender — even though it is MY turn and MY spell moved it", async () => {
    const game = await charmedIn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("runner").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.state("home").combatRole).toBeNull(); // uninvolved
  });

  test("the combat then runs normally: Runner (3) into Guard (4) — the attacker dies, the defender holds bfMine, nobody scores", async () => {
    const game = await charmedIn();
    await game.settle();
    expect(openShowdown(game)).toBeUndefined();
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.state("guard")).toMatchObject({ damage: 0, zone: "battlefield-bfMine" }); // survived 3 < 4; healed at end of combat (466)
    expect(game.gameState.battlefields.bfMine).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
