/**
 * Interaction: Tactical Retreat (unl-175-219) · Spell · Order · 2 · [Reaction]
 *     "Choose a friendly unit. The next time it would die this turn, heal it, exhaust it, and recall it
 *      instead. (Send it to base. This isn't a move.)"
 *   × Corrupt Enforcer (sfd-123-221) · Unit · Chaos · 3+[chaos] · 4 Might
 *     "When I move to a battlefield, discard 1. When I win a combat, draw 1."
 *   × Rune Prison (ogn-050-298) · Spell · Calm · 2+[calm] · [Action] "Stun a unit."
 *   × Shipyard Skulker (ogn-175-298) 3 Might · Playful Phantom (ogn-049-298) 5 Might (vanilla attackers)
 *
 * Rules: 455 / 456.1 (a Recall is not a Move and triggers no move abilities), 458.1 (a recall keeps
 * damage/statuses unless the source says otherwise), 466.1.a.2 (Combat Cleanup 3d: recall attackers if
 * defenders remain), 466.3.a (sole designated player with units = WON), 466.3.d ("No Result" if units
 * were recalled DURING STEP 3d), 369 / 370.1 / 373.1.a / 390.3 (a delayed "next time it would die …
 * instead" replacement is performed in place of the death, before simultaneous events), 423.1.b/.c
 * (a stunned unit deals no combat damage but still needs full lethal to die).
 *
 * Question: P2 holds bf1 with Corrupt Enforcer (4). P1's turn.
 *   Case A (3b): Skulker (3) attacks; in the showdown P1 Tactical-Retreats it; all pass.
 *   Case B (3d): Phantom (5) attacks; P2 Rune-Prisons it; all pass.
 *   Case C (control): Skulker attacks, no tricks.
 * Per case: damage dealt, where/how the attacker ends up, WIN(P2) vs No Result, does Enforcer draw,
 * does any move trigger fire, who controls bf1.
 *
 * Expected: A = {Skulker: P1 base, exhausted, 0 dmg, never died; WIN(P2) → Enforcer draws 1};
 *           B = {Phantom: P1 base, exhausted, still stunned, 0 dmg; NO RESULT → no draw};
 *           C = {Skulker: trash; WIN(P2) → draw 1}. No Move event beyond the one Standard Move in
 *           any case; Enforcer's discard trigger never fires; P2 keeps bf1 with no point (already held).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TACTICAL_RETREAT = "unl-175-219";
const CORRUPT_ENFORCER = "sfd-123-221";
const RUNE_PRISON = "ogn-050-298";
const SHIPYARD_SKULKER = "ogn-175-298";
const PLAYFUL_PHANTOM = "ogn-049-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", CORRUPT_ENFORCER, "enforcer")
    .unit(P1, "base", SHIPYARD_SKULKER, "skulker")
    .unit(P1, "base", PLAYFUL_PHANTOM, "phantom")
    .hand(P1, TACTICAL_RETREAT, "retreat")
    .hand(P2, RUNE_PRISON, "prison")
    .hand(P2, { might: 2, name: "P2 Discard Fodder" }, "fodder");
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;
const count = (game: Game, key: string): number => (game.gameState.turnEventCounts ?? {})[key] ?? 0;
const combatDamageTo = (game: Game, target: string) =>
  (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === target).map((r) => r.amount);
const activeShowdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** Case A up to the point where the combat has just been cleaned up (Enforcer's win trigger, if any, is on the chain). */
async function caseA(): Promise<{ game: Game; p2Hand: number }> {
  const game = await board().build();
  const p2Hand = game.p2.hand().length;
  await game.p1.move("skulker", "bf1");
  expect(activeShowdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true });
  await game.p1.cast("retreat", { targets: "skulker" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "retreat", controller: P1, targets: ["skulker"] })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("retreat")).toBe("trash");
  // Focus passed to P2 when the item resolved; both pass Focus → damage step + Combat Cleanup run
  await game.p2.passFocus();
  await game.p1.passFocus();
  return { game, p2Hand };
}

/** Case B up to the same point. */
async function caseB(): Promise<{ game: Game; p2HandAfterCast: number }> {
  const game = await board().build();
  await game.p1.move("phantom", "bf1");
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("prison", { targets: "phantom" });
  const p2HandAfterCast = game.p2.hand().length;
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("prison")).toBe("trash");
  expect(game.state("phantom").isStunned).toBe(true);
  await game.p1.passFocus();
  await game.p2.passFocus();
  return { game, p2HandAfterCast };
}

/** Case C up to the same point. */
async function caseC(): Promise<{ game: Game; p2Hand: number }> {
  const game = await board().build();
  const p2Hand = game.p2.hand().length;
  await game.p1.move("skulker", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  return { game, p2Hand };
}

describe("Case A — Tactical Retreat replaces the attacker's death at 3b: the defender WINS", () => {
  test("damage step: 3 → Enforcer (survives at 4 Might, healed at 3c), 4 → Skulker (lethal)", async () => {
    const { game } = await caseA();
    expect(combatDamageTo(game, "enforcer")).toEqual([3]);
    expect(combatDamageTo(game, "skulker")).toEqual([4]);
    await game.settle();
    expect(game.zoneOf("enforcer")).toBe("battlefield-bf1");
    expect(game.state("enforcer").damage).toBe(0);
    expect(game.state("enforcer").might).toBe(4);
  });

  test("3b: Skulker would die → healed to 0, exhausted, RECALLED to P1's base instead (369/370.1/373.1.a) — same object, never in the trash, no 'die' event", async () => {
    const { game } = await caseA();
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.p1.base()).toContain("skulker");
    expect(game.p1.trash()).not.toContain("skulker");
    expect(game.state("skulker")).toMatchObject({ combatRole: null, damage: 0, isExhausted: true, isStunned: false, owner: P1 });
    expect(count(game, "die|c:skulker")).toBe(0);
    expect(count(game, "die")).toBe(0);
  });

  test("result = WIN for P2 (466.3.a — the 3b replacement-recall is NOT a '3d recall', so 466.3.d does not apply): Corrupt Enforcer's 'When I win a combat' goes on the chain and P2 draws 1", async () => {
    const { game, p2Hand } = await caseA();
    expect(count(game, "win-combat|p:player-2|bf:bf1")).toBe(1);
    expect(count(game, "win-combat|c:enforcer")).toBe(1);
    expect(count(game, "win-combat|p:player-1")).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "enforcer", controller: P2, triggered: true })]);
    await game.settle();
    expect(game.chain()).toHaveLength(0);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
  });

  test("no Move occurred in the Resolution Step (456.1): the only 'move' event this turn is Skulker's Standard Move; Enforcer's 'When I move to a battlefield, discard 1' never fired (P2 discarded nothing)", async () => {
    const { game, p2Hand } = await caseA();
    await game.settle();
    expect(count(game, "move")).toBe(1);
    expect(count(game, "move|c:skulker")).toBe(1);
    expect(count(game, "move|c:enforcer")).toBe(0);
    expect(count(game, "discard")).toBe(0);
    expect(game.zoneOf("fodder")).toBe("hand");
    expect(game.p2.trash()).toHaveLength(0); // nothing of P2's was discarded …
    expect(game.p2.hand()).toHaveLength(p2Hand + 1); // … only the win-draw changed the hand
  });

  test("P2 retains bf1 (already controlled → no conquer, no point); back to P1's Neutral Open main phase", async () => {
    const { game } = await caseA();
    await game.settle();
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0);
    expect(activeShowdown(game)).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("Case B — stunned Phantom survives and is recalled by rule at 3d: NO RESULT", () => {
  test("damage step: the stunned Phantom contributes 0 (423.1.b) → Enforcer takes nothing; Enforcer deals 4 → Phantom (5) survives (423.1.c)", async () => {
    const { game } = await caseB();
    expect(combatDamageTo(game, "enforcer")).toEqual([]);
    expect(combatDamageTo(game, "phantom")).toEqual([4]);
    await game.settle();
    expect(game.zoneOf("enforcer")).toBe("battlefield-bf1");
    expect(game.state("enforcer").damage).toBe(0);
  });

  test("3b nobody dies; 3c heals; 3d defenders present → Phantom is RECALLED to P1's base by rule (466.1.a.2): exhausted (it paid the Standard Move), still stunned (458.1), 0 damage, not a death", async () => {
    const { game } = await caseB();
    await game.settle();
    expect(game.zoneOf("phantom")).toBe("base");
    expect(game.p1.base()).toContain("phantom");
    expect(game.state("phantom")).toMatchObject({ combatRole: null, damage: 0, isExhausted: true, isStunned: true });
    expect(count(game, "die")).toBe(0);
  });

  test("result = NO RESULT (466.3.d — a unit was recalled during step 3d): nobody 'won', Corrupt Enforcer does NOT trigger, P2 draws nothing", async () => {
    const { game, p2HandAfterCast } = await caseB();
    expect(count(game, "win-combat")).toBe(0);
    expect(count(game, "win-combat|p:player-2")).toBe(0);
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(count(game, "draw|p:player-2")).toBe(0);
    expect(game.p2.hand()).toHaveLength(p2HandAfterCast);
  });

  test("the 3d recall is not a Move either (456.1): still exactly one 'move' event (Phantom's attack), no discard; P2 keeps bf1, no point", async () => {
    const { game } = await caseB();
    await game.settle();
    expect(count(game, "move")).toBe(1);
    expect(count(game, "move|c:phantom")).toBe(1);
    expect(count(game, "discard")).toBe(0);
    expect(game.zoneOf("fodder")).toBe("hand");
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

describe("Case C — control: Skulker attacks with no Tactical Retreat", () => {
  test("3 ↔ 4: Skulker dies at 3b → P1's trash; Enforcer survives and heals", async () => {
    const { game } = await caseC();
    expect(combatDamageTo(game, "enforcer")).toEqual([3]);
    expect(combatDamageTo(game, "skulker")).toEqual([4]);
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.p1.trash()).toContain("skulker");
    expect(count(game, "die|c:skulker")).toBe(1);
    expect(game.zoneOf("enforcer")).toBe("battlefield-bf1");
    expect(game.state("enforcer").damage).toBe(0);
  });

  test("P2 is the sole designated player with units → WON (466.3.a): Enforcer's win trigger is the only chain item after combat and P2 draws 1; P2 keeps bf1, no point", async () => {
    const { game, p2Hand } = await caseC();
    expect(count(game, "win-combat|p:player-2|bf:bf1")).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "enforcer", controller: P2, triggered: true })]);
    await game.settle();
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(count(game, "move")).toBe(1);
    expect(count(game, "discard")).toBe(0);
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(0);
  });
});

describe("Summary — the three results differ exactly as 466.3 says", () => {
  test("A = WIN(P2)/+1 card, B = NO RESULT/+0, C = WIN(P2)/+1 — an engine that lumps 'attacker ended up in base' into No Result (A) or treats the 3d recall as a defender win (B) fails here", async () => {
    const a = await caseA();
    await a.game.settle();
    const b = await caseB();
    await b.game.settle();
    const c = await caseC();
    await c.game.settle();
    const summary = (g: Game, attacker: string, handBefore: number) => ({
      attackerZone: g.zoneOf(attacker),
      p2HandDelta: g.p2.hand().length - handBefore,
      p2Won: count(g, "win-combat|p:player-2"),
    });
    expect(summary(a.game, "skulker", a.p2Hand)).toEqual({ attackerZone: "base", p2HandDelta: 1, p2Won: 1 });
    expect(summary(b.game, "phantom", b.p2HandAfterCast)).toEqual({ attackerZone: "base", p2HandDelta: 0, p2Won: 0 });
    expect(summary(c.game, "skulker", c.p2Hand)).toEqual({ attackerZone: "trash", p2HandDelta: 1, p2Won: 1 });
    expect(a.game.state("skulker")).toMatchObject({ damage: 0, isExhausted: true, isStunned: false });
    expect(b.game.state("phantom")).toMatchObject({ damage: 0, isExhausted: true, isStunned: true });
  });
});
