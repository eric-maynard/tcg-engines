/**
 * Ruling 5ff69b448a577ab9 — Facebreaker (OGN-220 → ogn-220-298) · [Hidden] [Action] · [2] · "Stun a friendly unit and an enemy unit
 *     at the same battlefield. (They don't deal combat damage this turn.)"
 *   × Vilemaw's Lair (OGN-295 → ogn-295-298) · Battlefield · "Units can't move from here to base."
 *   (unl-060-219 Vilemaw is listed by the scrape; the answer concerns the Lair.)
 *
 * Q: What happens when Facebreaker is played at Vilemaw's Lair?
 * A: It resolves normally — stunning is not moving. Both targets are stunned and contribute no combat damage (410.1.b). When the
 *    combat ends with both sides still present, the attackers are RECALLED to base; the Lair does not stop that because a recall
 *    is not a move.
 * Rules: 410.1.b (stunned units deal no combat damage), 453–456 (recall ≠ move), 466.1.a.2 (surviving attackers recalled when
 *        defenders remain), 105 ("can't" only covers what it names — moves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FACEBREAKER = "ogn-220-298";
const VILEMAWS_LAIR = "ogn-295-298";

/** P1's turn with [2] and Facebreaker in hand; P1's 5-Might Raider in base. P2 controls the live Lair with a 4-Might Guard. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("lair", { controller: P2, def: VILEMAWS_LAIR, inert: false })
    .unit(P2, "lair", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P1, FACEBREAKER, "fb");
}

/** Raider attacks the Lair; P1 (Focus) Facebreakers Raider + Guard; the spell resolves. */
async function facebreakerAtTheLair(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "lair");
  expect(game.state("raider")).toMatchObject({ combatRole: "attacker" });
  expect(game.state("raider").keywords).toContain("NoMoveToBase"); // the Lair's text now applies to it
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "fb")).toBe(true);
  await game.p1.cast("fb", { targets: ["raider", "guard"] });
  expect(game.p1.energy()).toBe(0);
  expect(game.chain().map((c) => c.cardId)).toEqual(["fb"]);
  for (let i = 0; i < 4 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  return game;
}

describe("Ruling 5ff69b448a577ab9 — Facebreaker works at Vilemaw's Lair; the stunned attacker is still recalled home", () => {
  test("Facebreaker resolves: both the friendly Raider and the enemy Guard at the Lair are stunned (nobody moved anywhere)", async () => {
    const game = await facebreakerAtTheLair();
    expect(game.zoneOf("fb")).toBe("trash");
    expect(game.state("raider")).toMatchObject({ isStunned: true, zone: "battlefield-lair" });
    expect(game.state("guard")).toMatchObject({ isStunned: true, zone: "battlefield-lair" });
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(1); // just the attack
  });

  test("combat: stunned units deal no damage → nobody is hurt; defenders remain, so the Raider is RECALLED to base despite 'can't move from here to base' — and that is not counted as a move", async () => {
    const game = await facebreakerAtTheLair();
    await game.settle();
    expect(game.state("guard")).toMatchObject({ damage: 0, zone: "battlefield-lair" });
    expect(game.state("raider")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.p1.trash()).toEqual(["fb"]);
    expect(game.gameState.battlefields.lair).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(1); // the recall added nothing
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: without Facebreaker the same combat trades damage normally (Raider 5 kills Guard 4 and conquers)", async () => {
    const game = await board().build();
    await game.p1.move("raider", "lair");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("raider")).toBe("lair");
    expect(game.gameState.battlefields.lair?.controller).toBe(P1);
  });
});
