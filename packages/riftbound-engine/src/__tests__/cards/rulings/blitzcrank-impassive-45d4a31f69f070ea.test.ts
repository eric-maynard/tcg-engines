/**
 * Ruling 45d4a31f69f070ea — Blitzcrank, Impassive (OGN-067 → ogn-067-298) · Unit · [5][calm] · 5 Might
 *   "[Tank] When you play me to a battlefield, you may move an enemy unit to here.
 *    When I hold, return me to my owner's hand."
 *
 * Q: When Blitzcrank drags an opponent's unit onto MY battlefield, who is the attacker and who is the
 *    defender?
 * A: The pulled unit's controller is the Attacker; you are the Defender. Blitzcrank arriving at a
 *    battlefield you already control applies no Contested status — the enemy unit's arrival does, and
 *    whoever applies Contested is the attacker.
 * Rules: 442.1.a.1 (the player who applies Contested is the Attacker), 442.1.a.2 (the other is the
 *        Defender), 464.2.c (designations at the showdown), 447 (a move made by an effect is still a move).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLITZCRANK = "ogn-067-298";

/** P1's turn, [5][calm] for Blitzcrank. P1 already controls bf1 (a Holder stands there); P2's Raider sits at their own bf2. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 4, name: "Raider" }, "raider")
    .hand(P1, BLITZCRANK, "blitz");
}

/** Play Blitzcrank onto P1's own bf1 and stop right after he lands, before the pull is answered. */
async function blitzLands(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("blitz", { to: "bf1" });
  expect(game.zoneOf("blitz")).toBe("battlefield-bf1");
  return game;
}

/** Accept the pull and aim it at the Raider; let the move resolve. */
async function pullRaider(game: Game): Promise<void> {
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("raider");
  }
  await game.acting().passPriority();
  await game.acting().passPriority();
  expect(game.locationOf("raider")).toBe("bf1");
}

describe("Ruling 45d4a31f69f070ea — the unit Blitzcrank pulls in is the attacker; Blitzcrank's side defends", () => {
  test("step 1: Blitzcrank enters a battlefield P1 ALREADY controls, so nothing is contested by his arrival", async () => {
    const game = await blitzLands();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.state("blitz").combatRole).toBeNull();
  });

  test("ruling 45d4a31f69f070ea — the pulled enemy unit is what applies Contested: it is designated ATTACKER, and P1's units (Blitzcrank + Holder) are DEFENDERS", async () => {
    const game = await blitzLands();
    await pullRaider(game);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.state("raider")).toMatchObject({ combatRole: "attacker", controller: P2 });
    expect(game.state("blitz")).toMatchObject({ combatRole: "defender", controller: P1 });
    expect(game.state("holder").combatRole).toBe("defender");
    expect(game.violations()).toEqual([]);
  });

  test("the player who USED the effect is not thereby the attacker — P1 is the defender at their own battlefield", async () => {
    const game = await blitzLands();
    await pullRaider(game);
    expect(game.gameState.battlefields.bf1?.contestedBy).not.toBe(P1);
    expect(game.p1.units("bf1").map((u) => game.state(u).combatRole)).toEqual(["defender", "defender"]);
  });

  test("and the combat then plays out with those roles: the 4-Might attacker dies to Tank Blitzcrank (5) and P1 keeps bf1, nobody scores", async () => {
    const game = await blitzLands();
    await pullRaider(game);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("blitz")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("declining the pull leaves everything where it was: no contest, no combat, no designations", async () => {
    const game = await blitzLands();
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(game.locationOf("raider")).toBe("bf2");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.state("blitz").combatRole).toBeNull();
  });
});
