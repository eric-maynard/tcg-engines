/**
 * Ruling 3bd74c4f4962ace3 — Carnivorous Snapvine (ogn-149-298) · Unit · Body · [5][body][body] · 6 Might
 *   "When you play me, choose an enemy unit at a battlefield. We deal damage equal to our Mights to each other."
 *
 * Q: When does the Snapvine heal the damage its own ability took? If it damages a unit before attacking a
 *    battlefield, does it carry that damage into combat?
 * A: Units heal only after a COMBAT (combat showdown) and at the end of the turn. Damage dealt outside
 *    combat triggers no healing, so the Snapvine keeps it, walks into the battlefield with it, and only
 *    sheds it in the combat cleanup (or at end of turn).
 * Rules: 466.1.a.1 / 461.1.a.1 (Combat Cleanup "Heal all Units"), 317.2.b (end-of-turn heal),
 *        417 (damage is marked and persists), 344.2 (a non-combat showdown heals nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SNAPVINE = "ogn-149-298";

/** "Deal 4 to a unit." — a plain damage spell, stand-in for any non-combat damage. */
const BOLT = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt",
  rulesText: "Deal 4 to a unit.",
} as const;

/** P1 can afford the Snapvine; P2 holds bf1 with a 4-Might Bruiser and bf2 with a 2-Might Runt. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { body: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Bruiser" }, "bruiser")
    .unit(P2, "bf2", { might: 2, name: "Runt" }, "runt")
    .hand(P1, SNAPVINE, "vine");
}

/** Snapvine played into P1's base, fighting the 4-Might Bruiser at bf1. */
async function played(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("vine", { answers: ["bruiser"] });
  await game.settle();
  return game;
}

/** A Snapvine already in play (ready) takes 4 from a damage spell before attacking. */
async function damagedThenReadyToMove(): Promise<Game> {
  const game = await scenario()
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Runt" }, "runt")
    .unit(P1, "base", SNAPVINE, "vine")
    .hand(P1, BOLT, "bolt")
    .build();
  await game.p1.cast("bolt", { targets: "vine" });
  await game.settle();
  return game;
}

describe("Ruling 3bd74c4f4962ace3 — damage dealt outside combat sticks until a combat cleanup or end of turn", () => {
  test("the play trigger's fight marks BOTH units: the Snapvine keeps 4 damage in the base, no healing happens", async () => {
    const game = await played();
    expect(game.zoneOf("vine")).toBe("base");
    expect(game.state("vine").damage).toBe(4); // dealt by the 4-Might Bruiser
    expect(game.state("bruiser").damage).toBe(0); // it took 6 from a 6-Might Snapvine and died
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("a Snapvine already on the board that takes 4 non-combat damage carries it into the battlefield it attacks", async () => {
    const game = await damagedThenReadyToMove();
    expect(game.state("vine").damage).toBe(4);
    await game.p1.move("vine", "bf2");
    expect(game.locationOf("vine")).toBe("bf2");
    expect(game.state("vine").damage).toBe(4); // no heal for moving or for the showdown opening
    expect(game.state("vine").combatRole).toBe("attacker");
  });

  test("the combat at bf2 is what heals it — but the 2-Might Runt's 2 combat damage lands on top of the 4 it walked in with (6 = lethal on a 6-Might unit)", async () => {
    const game = await damagedThenReadyToMove();
    await game.p1.move("vine", "bf2");
    await game.settle();
    // carrying the non-combat damage in got it killed: an undamaged Snapvine would have shrugged the 2 off
    expect(game.zoneOf("vine")).toBe("trash");
    expect(game.zoneOf("runt")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  test("with no combat, the end of the turn is what heals it (317.2.b)", async () => {
    const game = await played();
    expect(game.state("vine").damage).toBe(4);
    await game.advanceTurn();
    expect(game.state("vine").damage).toBe(0);
    expect(game.trace().expiration[0]?.healed).toContain("vine");
    expect(game.violations()).toEqual([]);
  });
});
