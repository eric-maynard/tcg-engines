/**
 * Ruling 67dcf693e3623689 — Facebreaker (OGN-220 → ogn-220-298) · Order spell · [2] "[Hidden] [Action] Stun a friendly unit and
 *     an enemy unit at the same battlefield. (They don't deal combat damage this turn.)"
 *   × Vilemaw's Lair (OGN-295 → ogn-295-298) · Battlefield "Units can't move from here to base."
 *   (× Vilemaw unl-060-219 — the Lair's namesake — stands in as the defender.)
 *
 * Q: An attacker at Vilemaw's Lair is stunned by Facebreaker (so combat stalls). Can it return to base at the combat cleanup?
 * A: Yes. Attackers left facing surviving defenders are RECALLED to base, and a recall is not a move — the Lair's
 *    restriction doesn't apply.
 * Rules: 466.1.a.2 (combat cleanup recalls attackers if defenders remain), 454 (recalls are not moves), Stun (no combat
 *        damage this turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FACEBREAKER = "ogn-220-298";
const VILEMAWS_LAIR = "ogn-295-298";
const VILEMAW = "unl-060-219";
const FIGHT_OR_FLIGHT = "ogn-168-298"; // "[Action] Move a unit from a battlefield to its base." — witness that the Lair does forbid MOVES

/** P1's turn. P2 holds the live Vilemaw's Lair with Vilemaw (8) and has Facebreaker + [2]. P1's 9-Might Colossus attacks; P1 also holds Fight or Flight + [2]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2 })
    .battlefield("lair", { controller: P2, def: VILEMAWS_LAIR, inert: false, owner: P2 })
    .unit(P2, "lair", VILEMAW, "vilemaw")
    .unit(P1, "base", { might: 9, name: "Colossus" }, "colossus")
    .hand(P2, FACEBREAKER, "fb")
    .hand(P1, FIGHT_OR_FLIGHT, "fof");
}

/** Colossus attacks the Lair; P1 passes Focus; P2 Facebreakers [Vilemaw, Colossus]; it resolves. */
async function attackAndFacebreak(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("colossus", "lair");
  expect(game.state("colossus").combatRole).toBe("attacker");
  expect(game.state("vilemaw").combatRole).toBe("defender");
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "fb")).toBe(true);
  await game.p2.cast("fb", { targets: ["vilemaw", "colossus"] });
  expect(game.p2.energy()).toBe(0);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Facebreaker resolves
  expect(game.zoneOf("fb")).toBe("trash");
  return game;
}

describe("Ruling 67dcf693e3623689 — a Facebreaker-stunned attacker at Vilemaw's Lair is still recalled home", () => {
  test("premise: the Lair really forbids MOVING to base — P1's Fight or Flight on its own Colossus there resolves but the Colossus stays put", async () => {
    const game = await board().build();
    await game.p1.move("colossus", "lair");
    await game.p1.cast("fof", { targets: "colossus" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("colossus")).toBe("lair");
  });

  test("Facebreaker resolves: both Vilemaw and the Colossus are STUNNED and both remain at the Lair, combat still open", async () => {
    const game = await attackAndFacebreak();
    expect(game.state("vilemaw")).toMatchObject({ isStunned: true, location: "lair" });
    expect(game.state("colossus")).toMatchObject({ isStunned: true, location: "lair" });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "lair", isCombatShowdown: true });
  });

  test("ruling: everyone passes → no combat damage either way (both stunned), the defender survives, so the cleanup RECALLS the attacking Colossus to P1's base despite the Lair — undamaged; the Lair stays P2's, no points", async () => {
    const game = await attackAndFacebreak();
    await game.settle();
    expect((game.gameState.damageLog ?? []).filter((r) => r.combat && r.amount > 0)).toEqual([]);
    expect(game.zoneOf("vilemaw")).toBe("battlefield-lair");
    expect(game.zoneOf("colossus")).toBe("base");
    expect(game.state("colossus")).toMatchObject({ combatRole: null, controller: P1, damage: 0, location: "base" });
    expect(game.state("vilemaw").damage).toBe(0);
    expect(game.gameState.battlefields.lair?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
