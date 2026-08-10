/**
 * Ruling 58dd3dd197cfd1ab — Yasuo, Remorseful (OGN-076 → ogn-076-298) · Champion Unit · Calm · [6][calm][calm] · 6 Might
 *     "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Chaos Action spell · [2][chaos] "Move a friendly unit and ready it."
 *
 * Q: Yasuo attacks a battlefield holding a 7+ Might enemy; his attack trigger resolves for 6. During the action
 *    window Ride the Wind moves Yasuo back to base. Does combat still occur — healing the enemy unit's damage?
 * A: Yes. The showdown is the first step of combat: once Yasuo gained the Attacker designation combat had started.
 *    Ride the Wind (an Action) can't answer the trigger (attacker has focus only after triggers resolve); it moves
 *    Yasuo home afterwards; combat continues to resolution and the Combat Cleanup heals the enemy unit.
 * Rules: 442.1 (attacker designation), 341/347 (Reactions only on a chain; Actions once Focus is held on an
 *        empty chain), 466.1.a.1 (Combat Cleanup: heal all units).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn. P2 holds bf1 with an 8-Might Wall (bf2 is empty). Yasuo ready in P1's base; P1 holds Ride the Wind with exactly [2][chaos]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 8, name: "Wall" }, "wall")
    .unit(P1, "base", YASUO, "yasuo")
    .hand(P1, RIDE_THE_WIND, "ride");
}

/** Yasuo attacks bf1; answer the trigger's target prompt (Wall) if asked; stop at the first action decision. */
async function yasuoAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yasuo", "bf1");
  for (let i = 0; i < 6; i++) {
    const d: Decision | null = game.decision();
    if (!d || d.kind === "action") {
      break;
    }
    expect(d.seat).toBe(P1);
    if (d.kind === "pick") {
      const opt = d.options.find((o) => (o.card ?? o.key) === "wall");
      expect(opt).toBeDefined();
      await game.p1.answer({ keys: [opt!.key], kind: "pick" });
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  return game;
}

/** …then both pass on the trigger so it resolves (6 to Wall); P1 now holds Focus on an empty chain. */
async function triggerResolved(): Promise<Game> {
  const game = await yasuoAttacks();
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Ruling 58dd3dd197cfd1ab — Ride the Wind pulls Yasuo out after his trigger; combat still resolves and heals the enemy", () => {
  test("moving Yasuo in starts COMBAT: a combat showdown is open at bf1, Yasuo is the Attacker, Wall the Defender, and the attack trigger is on the chain", async () => {
    const game = await yasuoAttacks();
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.state("wall").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
    expect(game.state("wall").damage).toBe(0);
  });

  test("nuance: Ride the Wind (an Action) can NOT be played in response to Yasuo's trigger — only after it resolves does the attacker hold Focus on an empty chain", async () => {
    const game = await yasuoAttacks();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "ride")).toBe(false);
    const early = await game.p1.try((p) => p.cast("ride", { targets: "yasuo" }));
    expect(early.ok).toBe(false);
    expect(game.zoneOf("ride")).toBe("hand");
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves
    expect(game.state("wall")).toMatchObject({ damage: 6, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)?.focusPlayer).toBe(P1);
    expect(game.p1.can("cast", "ride")).toBe(true);
  });

  test("during the action window P1 Rides the Wind on Yasuo choosing base: Yasuo leaves bf1 (readied, in base) while Wall still carries 6 damage and the showdown is still open", async () => {
    const game = await triggerResolved();
    await game.p1.cast("ride", { targets: "yasuo" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toContain("base");
    await game.p1.pick("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ride"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ride the Wind resolves
    expect(game.zoneOf("ride")).toBe("trash");
    expect(game.zoneOf("yasuo")).toBe("base");
    expect(game.state("yasuo")).toMatchObject({ isReady: true, location: "base" });
    expect(game.state("wall").damage).toBe(6); // not healed yet — combat has not finished
    // The showdown does not end by itself just because the attacker left: Focus passes on.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("ruling: combat then continues to resolution — no combat damage is exchanged (no attacker left), the Combat Cleanup heals Wall to 0, bf1 stays P2's, nobody scores, Yasuo rests unharmed in base", async () => {
    const game = await triggerResolved();
    await game.p1.cast("ride", { targets: "yasuo" });
    await game.p1.pick("base");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);
    expect(game.state("wall")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-bf1" });
    expect((game.gameState.damageLog ?? []).filter((r) => r.combat)).toEqual([]); // no combat damage step happened
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.state("yasuo")).toMatchObject({ combatRole: null, damage: 0, isReady: true, location: "base" });
    expect(game.violations()).toEqual([]);
  });
});
