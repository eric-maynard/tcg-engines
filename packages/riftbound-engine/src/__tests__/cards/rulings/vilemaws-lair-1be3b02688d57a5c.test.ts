/**
 * Ruling 1be3b02688d57a5c — Vilemaw's Lair (OGN-295 → ogn-295-298) · Battlefield · "Units can't move from here to base."
 *   (Vilemaw unl-060-219 is listed with the ruling but plays no part in the answer.)
 *
 * Q: What happens when both my (attacking) unit and the enemy (defending) unit at Vilemaw's Lair are stunned?
 * A: 1) Stunned units contribute no combat damage, so with nobody else there both survive. 2) The defender still
 *    has units present, so the attackers are RECALLED to base. 3) That recall happens despite the Lair's "can't move
 *    from here to base" — a recall is not a move; the Lair only forbids the Move action.
 * Rules: 423.1.b (stunned deals no combat damage), 465/467 (attackers that fail to take the battlefield are
 *        recalled), recall ≠ move (Lair restricts moves only).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VILEMAWS_LAIR = "ogn-295-298";
/** Inline Reaction: "Stun a unit." — how the attacker ends up stunned mid-combat. */
const DAZE = { abilities: [{ effect: { target: { type: "unit" }, type: "stun" }, timing: "reaction", type: "spell" }], cardType: "spell", domain: "calm", energyCost: 1, name: "Test Daze", timing: "reaction" };

/**
 * P1's turn. "lair" = Vilemaw's Lair (live text) held by P2 with a STUNNED 4-Might Spider on it. P1's 3-Might Raider
 * is ready in base; P2 holds Daze (stun a unit) with [1] to stun the Raider once it attacks.
 */
function board() {
  return scenario()
    .battlefield("lair", { controller: P2, def: VILEMAWS_LAIR, inert: false })
    .unit(P2, "lair", { might: 4, name: "Spider" }, "spider", { stunned: true })
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, DAZE, "daze")
    .resources(P2, { energy: 1 });
}

/** Raider attacks the Lair; P1 passes focus; P2 stuns the Raider with Daze; stop with both stunned, combat unresolved. */
async function bothStunnedAtLair(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "lair");
  expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "lair", isCombatShowdown: true });
  expect(game.state("raider").keywords).toContain("NoMoveToBase"); // the Lair's restriction is on the attacker now
  await game.p1.passFocus();
  expect(game.p2.can("cast", "daze")).toBe(true);
  await game.p2.cast("daze", { targets: "raider" });
  for (let i = 0; i < 4 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.state("raider")).toMatchObject({ combatRole: "attacker", isStunned: true });
  expect(game.state("spider")).toMatchObject({ combatRole: "defender", isStunned: true });
  return game;
}

describe("Ruling 1be3b02688d57a5c — attacker and defender both stunned at Vilemaw's Lair", () => {
  test("1) combat damage: neither stunned unit deals damage — both survive with 0 damage", async () => {
    const game = await bothStunnedAtLair();
    await game.settle(); // remaining focus passes → combat damage step → resolution
    expect(game.zoneOf("spider")).toBe("battlefield-lair");
    expect(game.state("spider").damage).toBe(0);
    expect(game.has("raider")).toBe(true);
    expect(game.zoneOf("raider")).not.toBe("trash");
    expect(game.state("raider").damage).toBe(0);
  });

  test("2)+3) the defender still holds the Lair, so the attacker is RECALLED to base — even though units 'can't move from here to base' (recall is not a move)", async () => {
    const game = await bothStunnedAtLair();
    await game.settle();
    expect(game.gameState.battlefields.lair).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.state("raider").combatRole).not.toBe("attacker");
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(1); // only the attack itself was a move; the recall isn't counted
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("premise check: the Lair's restriction is real for MOVES — a ready unit standing at the Lair is not offered a standard move to base", async () => {
    const game = await scenario()
      .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
      .unit(P1, "lair", { might: 3, name: "Tenant" }, "tenant")
      .build();
    const toBase = game.p1.legal().find((o) => o.key === "standardMove:to:base");
    const movable = (toBase?.fields.find((f) => f.name === "unitIds")?.options ?? []).flat();
    expect(movable).not.toContain("tenant");
    expect((await game.p1.try((p) => p.move("tenant", "base"))).ok).toBe(false);
    expect(game.locationOf("tenant")).toBe("lair");
  });
});
