/**
 * Interaction: Rune Prison (ogn-050-298) · Spell · Calm · 2 + [calm] · Action — "Stun a unit. (It doesn't deal combat
 *     damage this turn.)"                                                                              — P2's
 *   × Ride the Wind (ogn-173-298) · Spell · Chaos · 2 + [chaos] · Action — "Move a friendly unit and ready it." — P1's
 *   × Playful Phantom (ogn-049-298) · Unit · Calm · 5 · 5 Might (vanilla)                              — P1's mover
 *   (+ Shipyard Skulker ogn-175-298, vanilla 3 Might — P2's defender at bf1)
 *
 * Rules: 458 / 458.1 (a Recall does not touch damage or statuses — exhausted/ready and Stunned ride through), 455 /
 * 456.1 (a Recall is not a Move, no move triggers), 466.1.a.1 (combat cleanup 3c: heal all), 466.1.a.2 (3d: recall
 * Attackers if Defenders remain), 466.3.d ("No Result" when 3d recalled), 423.1 / 423.1.a.2 (Stunned is a status
 * cleared at 3d of the END-OF-TURN cleanup only), 423.1.b (a stunned unit contributes no Might to combat damage),
 * 423.1.c (it can still be dealt lethal damage), 144.2 (the Standard Move's cost is exhausting the unit), 449.1 (an
 * effect Move is restricted only by its source), 317.2 (Expiration Step).
 *
 * Question: P1's turn; P2 holds bf1 with Skulker (3). P1 Standard-Moves a ready Phantom (5) base → bf1. In the
 * showdown P2 Rune-Prisons the Phantom. All pass.
 *   (a) Combat 1: damage dealt, survivors, 3c/3d, result; EXACT state of the Phantom back in base — exhausted?
 *       stunned? damaged? Standard Move available?
 *   (b) Same Main Phase P1 Rides the Wind the Phantom → bf1: legal while stunned? arrives ready? deals damage in
 *       Combat 2? After the second 3d recall: READY or exhausted, still stunned?
 *   (c) When does the stun end; what happens when the Phantom attacks bf1 on P1's NEXT turn?
 *
 * Expected: (a) P1 deals 0 (stunned), Skulker deals 3 → Phantom 3 damage, not lethal; 3c heals; 3d recalls the
 * Phantom → base EXHAUSTED (paid the move cost; recall doesn't ready), STILL STUNNED, 0 damage, 5 Might; No Result:
 * P2 keeps bf1, no points; no Standard Move for it. (b) Ride the Wind is legal on the stunned, exhausted Phantom; it
 * arrives READY and still stunned; Combat 2: 0 vs 3 again, survives, 3d recall → base READY and still stunned; P2
 * keeps bf1. (c) the stun expires at 3d of THIS turn's Expiration Step; next P1 turn the Phantom attacks unstunned:
 * Skulker dies, Phantom survives (healed), P1 conquers bf1 (+1).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUNE_PRISON = "ogn-050-298";
const RIDE_THE_WIND = "ogn-173-298";
const PLAYFUL_PHANTOM = "ogn-049-298";
const SHIPYARD_SKULKER = "ogn-175-298";

/**
 * Turn 2, P1 active, Neutral Open. P1: ready Playful Phantom in base, Ride the Wind in hand, exactly 2 + [chaos].
 * P2: Shipyard Skulker at bf1 (P2's), Rune Prison in hand, exactly 2 + [calm]. bf1 is the only battlefield.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", SHIPYARD_SKULKER, "skulker")
    .unit(P1, "base", PLAYFUL_PHANTOM, "phantom")
    .hand(P1, RIDE_THE_WIND, "ride")
    .hand(P2, RUNE_PRISON, "prison");
}

/** P1 Standard-Moves the Phantom to bf1, passes Focus; P2 (now with Focus) Rune-Prisons it; both pass priority → stunned. Showdown still open, P1 has Focus. */
async function stunnedInShowdown(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("phantom", "bf1");
  await game.p1.passFocus();
  expect(game.actingSeat()).toBe(P2);
  await game.p2.cast("prison", { targets: "phantom" });
  await game.p2.passPriority();
  await game.p1.passPriority(); // Rune Prison resolves
  return game;
}

/** …then everybody passes Focus and Combat 1 resolves (3d recall). Back in P1's open main phase. */
async function afterCombat1(): Promise<Game> {
  const game = await stunnedInShowdown();
  const settled = await game.settle();
  expect(settled.reason).toBe("open");
  return game;
}

/** …then P1 casts Ride the Wind on the Phantom (bf1 is the only other location → destination auto-bound) and it resolves. Showdown 2 open. */
async function riddenBack(): Promise<Game> {
  const game = await afterCombat1();
  await game.p1.cast("ride", { targets: "phantom" });
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
    await game.p1.pick("battlefield-bf1");
  }
  await game.p1.passPriority();
  await game.p2.passPriority(); // Ride the Wind resolves: move + ready
  return game;
}

describe("Rune Prison × Ride the Wind × Playful Phantom — stun and ready/exhausted both ride through the 3d recall (458.1)", () => {
  // ── setup / (a) ─────────────────────────────────────────────────────────────────────────────────

  test("setup: the Standard Move exhausts the Phantom (144.2), bf1 is contested by P1 and a combat showdown opens with P1 holding Focus; after P1 passes, P2 may cast Rune Prison (Action, in a showdown) on it → Stunned (423.1)", async () => {
    const game = await board().build();
    expect(game.state("phantom").isReady).toBe(true);
    await game.p1.move("phantom", "bf1");
    expect(game.state("phantom")).toMatchObject({ combatRole: "attacker", isExhausted: true, location: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    expect(game.p2.can("cast", "prison")).toBe(true);
    await game.p2.cast("prison", { targets: "phantom" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "prison", controller: P2, targets: ["phantom"] })]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("prison")).toBe("trash");
    expect(game.state("phantom")).toMatchObject({ isStunned: true, location: "bf1", might: 5 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" }); // showdown continues
  });

  test("(a) Combat 1: the stunned Phantom contributes 0 (423.1.b) — Skulker (3) survives undamaged; Skulker's 3 into the Phantom (5) is not lethal; 3c heals it to 0; 3d recalls the Attacker to P1's base; 'No Result' — P2 keeps bf1, nobody scores (466.1.a, 466.3.d)", async () => {
    const game = await afterCombat1();
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.state("skulker").damage).toBe(0);
    expect(game.zoneOf("phantom")).toBe("base");
    expect(game.state("phantom")).toMatchObject({ damage: 0, location: "base", might: 5 });
    // it WAS hit for 3 in that combat (then healed) — the raw damage record shows the blow landed
    expect(game.state("phantom").meta.lastDamage).toMatchObject({ amount: 3, combat: true });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.chain()).toEqual([]); // 456.1: the recall put nothing on the chain
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
  });

  test("(a) 458 / 458.1: the recalled Phantom arrives EXHAUSTED (it paid the move cost; a recall does not ready) and STILL STUNNED — so no Standard Move is available to it", async () => {
    const game = await afterCombat1();
    expect(game.state("phantom")).toMatchObject({ isExhausted: true, isReady: false, isStunned: true, location: "base" });
    expect(game.p1.legal().some((o) => o.verb === "move")).toBe(false);
    const r = await game.p1.try((p) => p.move("phantom", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (b) Ride the Wind ───────────────────────────────────────────────────────────────────────────

  test("(b) Ride the Wind IS legal on the stunned, exhausted Phantom (449.1 — an effect move; stun doesn't restrict movement): it moves base → bf1 and is READIED, yet remains STUNNED (readying doesn't clear stun); bf1 contested again, Combat 2 showdown with P1 Attacker", async () => {
    const game = await afterCombat1();
    expect(game.p1.can("cast", "ride")).toBe(true);
    expect(game.p1.option("cast", "ride")?.fields.find((f) => f.name === "targets")?.options).toEqual([["phantom"]]);
    await game.p1.cast("ride", { targets: "phantom" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
      await game.p1.pick("battlefield-bf1");
    }
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("ride")).toBe("trash");
    expect(game.state("phantom")).toMatchObject({ combatRole: "attacker", isExhausted: false, isReady: true, isStunned: true, location: "bf1", might: 5 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", focusPlayer: P1, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("(b) Combat 2: still stunned → the Phantom again deals 0 (Skulker survives, 0 damage), takes 3, survives, healed; 3d recalls it and this time it arrives READY (Ride the Wind readied it — 458.1 works both ways) and STILL STUNNED; 'No Result', P2 keeps bf1, no points, empty chain", async () => {
    const game = await riddenBack();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.state("skulker").damage).toBe(0);
    expect(game.state("phantom")).toMatchObject({ damage: 0, isExhausted: false, isReady: true, isStunned: true, location: "base", might: 5 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.chain()).toEqual([]);
    // ready again → the Standard Move is back on the menu (it could go a third time — still for 0 damage)
    expect(game.p1.can("standardMove:to:bf1")).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (c) the stun ends at 3d of THIS turn's Expiration Step ─────────────────────────────────────

  test("(c) the Stunned status is removed in step 3d of this turn's end-of-turn cleanup (423.1.a.2 / 317.2): on P2's turn the Phantom is no longer stunned, and the expiration trace records it", async () => {
    const game = await riddenBack();
    await game.settle();
    expect(game.state("phantom").isStunned).toBe(true); // still P1's turn
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("phantom").isStunned).toBe(false);
    const passes = game.trace().expiration;
    expect(passes.length).toBeGreaterThanOrEqual(1);
    expect(passes[0]?.expired).toContain("stun:phantom");
  });

  test("(c) on P1's NEXT turn the (Awaken-readied, unstunned) Phantom Standard-Moves to bf1 and this time deals its 5: Skulker (3) dies, Phantom takes 3 and survives (healed), P1 conquers bf1 and scores", async () => {
    const game = await riddenBack();
    await game.settle();
    await game.advanceTurn(); // → P2 (P2 holds bf1 at its Beginning Phase → +1)
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p2.points()).toBe(1); // hold point, for the record
    expect(game.state("phantom")).toMatchObject({ isReady: true, isStunned: false, location: "base" });
    const p1Before = game.p1.points();
    await game.p1.move("phantom", "bf1");
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.state("phantom")).toMatchObject({ damage: 0, isExhausted: true, isStunned: false, location: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(p1Before + 1);
    expect(game.violations()).toEqual([]);
  });
});
