/**
 * Core rules — Combat fundamentals I: staging, the combat showdown, the
 * combat damage step, resolution (recall / conquer / uncontrolled),
 * win-vs-tie and scoring edges.
 *
 * Rules covered (riftbound-rules ids):
 *   144.1.c, 144.2, 144.3, 144.3.a, 144.3.c   standard move (cost, timing, simultaneous)
 *   190.3.a.1, 190.3.b, 190.4.b, 450          Contested status / control frozen during combat
 *   323.5, 323.8, 323.9, 323.13, 143.2.a      cleanup: lethal damage kills, combat staged/begun
 *   335, 335.1, 340.1, 340.2.a, 346.1, 347.*, 348, 348.1   focus / priority / LIFO / showdown close
 *   338.1.a.2, 359.3.e.5, 319.5               Reaction timing, illegal target on resolution
 *   423.1.a.2, 423.1.b, 423.1.c               stunned units in combat
 *   453, 455, 456, 456.1, 458, 458.1          recall is not a move, keeps state
 *   460, 464.2 (c.1, c.1.a, c.2, c.3, d, e, e.1, f, f.1, g)   combat opens / designations / combat chain
 *   465.1, 465.2 (a, b, c, c.1.a, c.3, c.4, d) combat damage step
 *   466.1.a.1, 466.1.a.2, 466.3.a, 466.3.d, 466.5 (a, b, d, e), 466.7.a   resolution step
 *   469.1, 469.2, 470, 471.1, 471.1.b, 471.1.b.1, 471.2.a, 471.2.c, 472   scoring
 *   740.3.a                                   "tie"
 *   142.4.b, 317.2.c                          "this turn" Might expires at end of turn
 *
 * All deniers/modifiers are inline abilities/spells on filler cards.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";
import { peekCurrentState, replaceCurrentState } from "../../harness/internal";

// ---------------------------------------------------------------------------
// Inline filler abilities / spells
// ---------------------------------------------------------------------------

/** "When I win a combat, draw 1." */
const WIN_DRAW = { effect: { amount: 1, type: "draw" }, trigger: { event: "win-combat", on: "self" }, type: "triggered" } as const;
/** "When I attack, draw 1." */
const ATTACK_DRAW = { effect: { amount: 1, type: "draw" }, trigger: { event: "attack", on: "self" }, type: "triggered" } as const;
/** "When I move, draw 1." */
const MOVE_DRAW = { effect: { amount: 1, type: "draw" }, trigger: { event: "move", on: "self" }, type: "triggered" } as const;
/** Battlefield: "When you conquer here, draw 1." */
const CONQUER_HERE_DRAW = { effect: { amount: 1, type: "draw" }, trigger: { event: "conquer", on: "self" }, type: "triggered" } as const;

function spell(name: string, effect: Record<string, unknown>, timing: "action" | "reaction" = "action") {
  return { abilities: [{ effect, timing, type: "spell" }], cardType: "spell", energyCost: 0, name, timing };
}

/** Action — "Give a friendly unit +N Might this turn." */
const buffSpell = (n: number) =>
  spell(`Buff +${n}`, { amount: n, duration: "turn", target: { controller: "friendly", type: "unit" }, type: "modify-might" });
/** Reaction — "Deal 3 to a unit." */
const ZAP = spell("Zap", { amount: 3, target: { type: "unit" }, type: "damage" }, "reaction");
/** Action — "Return a friendly unit to its owner's hand." */
const RETREAT = spell("Retreat", { target: { controller: "friendly", type: "unit" }, type: "return-to-hand" });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function showdown(game: Game) {
  const stack = game.gameState.interaction?.showdownStack ?? [];
  return stack[stack.length - 1];
}

function turnStateOf(game: Game): "neutral-open" | "neutral-closed" | "showdown-open" | "showdown-closed" {
  const sd = showdown(game)?.active === true;
  const chain = (game.gameState.interaction?.chain?.items.length ?? 0) > 0;
  return sd ? (chain ? "showdown-closed" : "showdown-open") : chain ? "neutral-closed" : "neutral-open";
}

/** SETUP ONLY: patch the game-specific state (e.g. scoredThisTurn) before any move is made. */
function patchState(game: Game, fn: (draft: Record<string, unknown>) => void): void {
  const engine = game.engine;
  const st = structuredClone(peekCurrentState(engine)) as unknown as Record<string, unknown>;
  fn(st);
  replaceCurrentState(engine, st as never);
  engine.getFlowManager()?.syncState(peekCurrentState(engine) as never);
}

/** Both players pass focus in sequence (attacker first) → showdown closes → combat resolves. */
async function passBoth(game: Game): Promise<void> {
  await game.p1.passFocus();
  await game.p2.passFocus();
}

// ===========================================================================
// Staging & the combat showdown
// ===========================================================================

describe("Staging: a standard move into an enemy battlefield contests it and opens a combat showdown", () => {
  test("standard-move-into-enemy-battlefield-stages-and-opens-combat-showdown", async () => {
    const game = await scenario()
      .victoryScore(8)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender D" }, "D")
      .unit(P1, "base", { might: 3, name: "Attacker A" }, "A")
      .unit(P1, "base", { might: 1, name: "Bystander" }, "B")
      .build();
    expect(turnStateOf(game)).toBe("neutral-open");

    await game.p1.move("A", "bf1");

    // 144.2: exhausting is the cost; A is now at bf1.
    expect(game.locationOf("A")).toBe("bf1");
    expect(game.state("A").isExhausted).toBe(true);
    // 450 / 190.3.a.1: Contested applied by P1.
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.gameState.battlefields.bf1?.contestedBy).toBe(P1);
    // 323.13 / 460 / 464.2: combat has begun with a combat showdown at bf1 (Showdown Open State, 464.2.f.1).
    const sd = showdown(game);
    expect(sd?.active).toBe(true);
    expect(sd?.battlefieldId).toBe("bf1");
    expect(sd?.isCombatShowdown).toBe(true);
    expect(turnStateOf(game)).toBe("showdown-open");
    // 464.2.c.1 / 464.2.c.2 / 464.2.c.3: designations.
    expect(sd?.attackingPlayer).toBe(P1);
    expect(sd?.defendingPlayer).toBe(P2);
    expect(game.state("A").combatRole).toBe("attacker");
    expect(game.state("D").combatRole).toBe("defender");
    expect(game.state("B").combatRole).toBeNull();
    // 464.2.c.1.a / 464.2.d / 335.1: attacker holds Focus and Priority.
    expect(sd?.focusPlayer).toBe(P1);
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });

    // Must NOT: no damage yet (465.2), control unchanged (190.4.b), no points, no recall,
    // no further Standard Move during the showdown (144.1.c).
    expect(game.state("A").damage).toBe(0);
    expect(game.state("D").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.can("standardMove")).toBe(false);
    expect((await game.p1.try((p) => p.move("B", "bf1"))).ok).toBe(false);
    expect(game.locationOf("B")).toBe("base");
  });
});

// ===========================================================================
// The combat damage step & resolution
// ===========================================================================

describe("Combat damage step: both pass → attacker assigns first, damage dealt simultaneously, lethal units die", () => {
  test("both-players-pass-then-attacker-assigns-first-damage-simultaneous-defender-dies-attacker-conquers", async () => {
    const game = await scenario()
      .victoryScore(8)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender D" }, "D")
      .unit(P1, "base", { might: 3, name: "Attacker A" }, "A")
      .build();
    await game.p1.move("A", "bf1");

    // Step 1: P1 passes focus → showdown stays open, P2 has focus + priority (347.2.b); still no damage.
    await game.p1.passFocus();
    expect(showdown(game)?.active).toBe(true);
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.state("A").damage).toBe(0);
    expect(game.state("D").damage).toBe(0);
    expect(game.zoneOf("D")).toBe("battlefield-bf1");

    // Step 2: P2 passes → all passed in sequence → showdown closes (347.2.a, 348.1) → damage step + resolution.
    await game.p2.passFocus();
    expect(showdown(game)).toBeUndefined();
    // 465.2.c / 465.2.d / 323.5 / 143.2.a: D took 3 ≥ 2 → killed → P2 trash.
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.state("D").owner).toBe(P2);
    // 466.1.a.1: A healed NOW (still P1's main phase), not at end of turn.
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("A").damage).toBe(0);
    // 466.1.a.2: no defender remains → no recall; A stays at bf1, still exhausted.
    expect(game.locationOf("A")).toBe("bf1");
    expect(game.state("A").isExhausted).toBe(true);
    // 466.5 / 466.5.d / 469.1 / 471.1: P1 establishes control → Conquer → +1 (exactly one).
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    // 466.5.a: Contested cleared. 466.7.a: designations removed.
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.state("A").combatRole).toBeNull();
    // 335: back to Neutral Open with the turn player holding priority.
    expect(turnStateOf(game)).toBe("neutral-open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("weaker-attacker-dies-defender-survives-heals-immediately (no control change, no points)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { abilities: [WIN_DRAW], might: 4, name: "Defender D" }, "D")
      .unit(P1, "base", { might: 2, name: "Attacker A" }, "A")
      .build();
    const readyBefore = game.state("D").isReady;
    await game.p1.move("A", "bf1");
    await passBoth(game);
    await game.settle();

    // 465.2.c / 323.5: A (2 < 4 dealt to it? no — A took 4 ≥ 2) dies; D took 2 < 4 survives.
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.state("A").owner).toBe(P1);
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    // 466.1.a.1 / 143.3.b.2: D healed to 0 in the same combat cleanup — still P1's main phase.
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.state("D").damage).toBe(0);
    // Combat does not change D's ready/exhausted state.
    expect(game.state("D").isReady).toBe(readyBefore);
    // 466.5: P2 already controls → no establish / no conquer / no point for anyone; contested cleared.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.state("D").combatRole).toBeNull();
  });

  test.failing("BUG: 466.3.a — the surviving defender WON the combat, so its 'When I win a combat' trigger should fire (engine never emits win-combat)", async () => {
    // Expected: D is the only designated player's unit remaining → P2 won → D's trigger draws 1.
    // Actual: the engine never fires a `win-combat` event, so P2's hand is unchanged.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { abilities: [WIN_DRAW], might: 4, name: "Defender D" }, "D")
      .unit(P1, "base", { might: 2, name: "Attacker A" }, "A")
      .build();
    const h = game.p2.hand().length;
    await game.p1.move("A", "bf1");
    await passBoth(game);
    await game.settle();
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.p2.hand().length).toBe(h + 1);
  });
});

describe("Equal might 1v1: simultaneous damage kills both — No Result, battlefield becomes Uncontrolled", () => {
  test("equal-might-one-on-one-both-die-no-result-battlefield-becomes-uncontrolled", async () => {
    const game = await scenario()
      .active(P1)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { abilities: [WIN_DRAW], might: 3, name: "Defender D" }, "D")
      .unit(P1, "base", { abilities: [WIN_DRAW], might: 3, name: "Attacker A" }, "A")
      .build();
    const h1 = game.p1.hand().length;
    const h2 = game.p2.hand().length;
    await game.p1.move("A", "bf1");
    await passBoth(game);
    await game.settle();

    // 465.2.c.1.a / 465.2.d / 323.5: dealt simultaneously → BOTH die (assigning first is no first strike).
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.zoneOf("D")).toBe("trash");
    // 466.3.d: No Result → neither win-trigger fires.
    expect(game.p1.hand().length).toBe(h1);
    expect(game.p2.hand().length).toBe(h2);
    expect(game.chain()).toEqual([]);
    // 466.5.b: no units of any player → Uncontrolled; 466.5.a contested cleared; nobody scores.
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);

    // 469.2: at P2's next Beginning Phase P2 does NOT hold bf1 (requires control).
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });
});

describe("Tie (740.3.a): both sides survive → attacker recalled exhausted, everyone healed, no conquer, nobody wins", () => {
  test("tie-both-sides-survive-attacker-recalled-exhausted-healed-no-conquer-nobody-wins", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { abilities: [WIN_DRAW], might: 3, name: "Stunned Wall D" }, "D", { stunned: true })
      .unit(P1, "base", { abilities: [WIN_DRAW], might: 2, name: "Attacker A" }, "A")
      .build();
    const h1 = game.p1.hand().length;
    const h2 = game.p2.hand().length;
    expect(game.state("D").isStunned).toBe(true);
    await game.p1.move("A", "bf1");
    expect(game.state("A").isExhausted).toBe(true);
    await passBoth(game);
    await game.settle();

    // 423.1.c: 2 damage on a stunned Might-3 unit is NOT lethal; 423.1.b: stunned D contributes 0 → A dealt 0.
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    expect(game.zoneOf("A")).toBe("base");
    // 466.1.a.1: healed; 466.1.a.2 + 458/458.1/456: A recalled to base, still exhausted, undamaged.
    expect(game.state("D").damage).toBe(0);
    expect(game.state("A").damage).toBe(0);
    expect(game.state("A").isExhausted).toBe(true);
    // 466.3.d No Result: neither "win a combat" trigger fires.
    expect(game.p1.hand().length).toBe(h1);
    expect(game.p2.hand().length).toBe(h2);
    // 466.5 / 466.5.a: P2 keeps control, no points, contested cleared.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    // 423.1.a.2: D remains stunned until end of turn.
    expect(game.state("D").isStunned).toBe(true);
    expect(turnStateOf(game)).toBe("neutral-open");
  });

  test.failing("BUG: 466.7.a — the Attacker designation must be removed from a recalled attacker (engine leaves combatRole='attacker' on units recalled to base)", async () => {
    // Expected: after combat ends, A (recalled to base) has no combat designation.
    // Actual: resolveFullCombat only clears combatRole on units still at the battlefield.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Stunned Wall D" }, "D", { stunned: true })
      .unit(P1, "base", { might: 2, name: "Attacker A" }, "A")
      .build();
    await game.p1.move("A", "bf1");
    await passBoth(game);
    await game.settle();
    expect(game.zoneOf("A")).toBe("base");
    expect(game.state("D").combatRole).toBeNull();
    expect(game.state("A").combatRole).toBeNull();
  });
});

// ===========================================================================
// Multi-unit assignment
// ===========================================================================

describe("Two attackers vs one defender: exactly one attacker dies, the survivor conquers and is not recalled", () => {
  test("simultaneous standard move of two units is one action; both exhausted; one combat with both as Attackers (144.3)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Defender D" }, "D")
      .unit(P1, "base", { might: 2, name: "A1" }, "A1")
      .unit(P1, "base", { might: 4, name: "A2" }, "A2")
      .build();
    await game.p1.move(["A1", "A2"], "bf1");
    expect(game.locationOf("A1")).toBe("bf1");
    expect(game.locationOf("A2")).toBe("bf1");
    // 144.3.c: both costs paid.
    expect(game.state("A1").isExhausted).toBe(true);
    expect(game.state("A2").isExhausted).toBe(true);
    expect(game.state("A1").combatRole).toBe("attacker");
    expect(game.state("A2").combatRole).toBe("attacker");
    expect(game.state("D").combatRole).toBe("defender");
    expect(game.gameState.interaction?.showdownStack.length).toBe(1);
    expect(showdown(game)?.attackingPlayer).toBe(P1);
    // 144.3: ONE move action for "units moved" bookkeeping? — at least the move counter counts units, not extra actions.
    expect(game.p1.can("standardMove")).toBe(false);
  });

  test("defender's 5 must go lethal-first (465.2.c.3/465.2.c.4): exactly one attacker dies; D (6 ≥ 5) dies; survivor healed, NOT recalled, P1 conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Defender D" }, "D")
      .unit(P1, "base", { might: 2, name: "A1" }, "A1")
      .unit(P1, "base", { might: 4, name: "A2" }, "A2")
      .build();
    await game.p1.move(["A1", "A2"], "bf1");
    await passBoth(game);
    await game.settle({ policy: "first" });

    expect(game.zoneOf("D")).toBe("trash");
    const dead = ["A1", "A2"].filter((id) => game.zoneOf(id) === "trash");
    const alive = ["A1", "A2"].filter((id) => game.zoneOf(id) === "battlefield-bf1");
    // Any legal assignment of 5 among {2,4} kills exactly one (2→A1 then 3→A2, or 4→A2 then 1→A1).
    expect(dead.length).toBe(1);
    expect(alive.length).toBe(1);
    // 466.1.a.1: survivor healed; 466.1.a.2: no defender remains → NOT recalled; still exhausted.
    expect(game.state(alive[0] as string).damage).toBe(0);
    expect(game.state(alive[0] as string).isExhausted).toBe(true);
    expect(game.p1.units("base")).toEqual([]);
    // 466.5 / 466.5.d: conquer.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
  });

  test.failing("BUG: 465.2.c — the DEFENDER chooses the order among attackers: a distribute/pick Decision for P2 should surface and Option Y (4→A2 lethal, 1→A1) must be accepted (engine auto-assigns, no decision)", async () => {
    // Expected: after the showdown closes P1 (single target) then P2 are asked to assign; P2 may pick
    // {A2:4, A1:1}; {A1:3, A2:2} and {A1:5} would be rejected (465.2.c.3 / 465.2.c.4).
    // Actual: resolveFullCombat distributes automatically (A1 lethal first) — no Decision for P2.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Defender D" }, "D")
      .unit(P1, "base", { might: 2, name: "A1" }, "A1")
      .unit(P1, "base", { might: 4, name: "A2" }, "A2")
      .build();
    await game.p1.move(["A1", "A2"], "bf1");
    await passBoth(game);
    // Drain anything forced for P1 (6 onto the lone D) until P2 is asked.
    for (let i = 0; i < 5 && game.decision()?.seat !== P2; i++) {
      const d = game.decision();
      if (!d || d.kind === "action") {
        break;
      }
      await game.settle({ maxSteps: 1, policy: "first" });
    }
    const d = game.decision();
    expect(d?.seat).toBe(P2);
    expect(["distribute", "pick", "order"]).toContain(d?.kind as string);
    if (d?.kind === "distribute") {
      expect((await game.p2.try((p) => p.distribute({ A1: 3, A2: 2 }))).ok).toBe(false);
      expect((await game.p2.try((p) => p.distribute({ A1: 5 }))).ok).toBe(false);
      await game.p2.distribute({ A1: 1, A2: 4 });
    } else if (d?.kind === "order") {
      await game.p2.order(["A2", "A1"]);
    } else {
      await game.p2.pick("A2");
    }
    await game.settle();
    expect(game.zoneOf("A2")).toBe("trash");
    expect(game.zoneOf("A1")).toBe("battlefield-bf1");
    expect(game.state("A1").damage).toBe(0);
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});

describe("Any surviving defender recalls ALL attackers (damaged or not); attacker picks which defender dies", () => {
  test("any-surviving-defender-recalls-ALL-attackers-including-undamaged-ones", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "D1" }, "D1")
      .unit(P2, "bf1", { might: 5, name: "D2 stunned wall" }, "D2", { stunned: true })
      .unit(P1, "base", { might: 3, name: "A1" }, "A1")
      .unit(P1, "base", { might: 3, name: "A2" }, "A2")
      .build();
    await game.p1.move(["A1", "A2"], "bf1");
    await passBoth(game);
    await game.settle({ policy: "first" });

    // Attackers' 6: one defender receives lethal first (465.2.c.3); with the default/first choice D1 (2) dies
    // and D2 takes the remaining 4 (< 5, allowed as last unit, 465.2.c.4) — or D2 dies and D1 survives.
    const defendersAlive = ["D1", "D2"].filter((id) => game.zoneOf(id) === "battlefield-bf1");
    const defendersDead = ["D1", "D2"].filter((id) => game.zoneOf(id) === "trash");
    expect(defendersDead.length).toBe(1);
    expect(defendersAlive.length).toBe(1);
    // Defenders' sum is 2 (423.1.b: stunned D2 contributes 0) → cannot kill a Might-3 attacker; both survive.
    // 466.1.a.2: a Defender is still present → BOTH attackers recalled (not only the damaged one), 458.1 still exhausted, healed.
    expect(game.zoneOf("A1")).toBe("base");
    expect(game.zoneOf("A2")).toBe("base");
    expect(game.state("A1").damage).toBe(0);
    expect(game.state("A2").damage).toBe(0);
    expect(game.state("A1").isExhausted).toBe(true);
    expect(game.state("A2").isExhausted).toBe(true);
    expect(game.state(defendersAlive[0] as string).damage).toBe(0);
    // 466.3.d No Result; P2 keeps control; no point; contested cleared.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test.failing("BUG: 465.2.c / 465.2.c.3 — the ATTACKER should be asked which defender takes lethal first (script: 2→D1 then 4→D2) and P2's split {A1:1,A2:1} must be rejected (engine auto-assigns, no decision)", async () => {
    // Expected: a P1 assignment Decision (choice (i) D1 lethal then rest to D2), then a P2 Decision that
    // rejects a 1/1 split. Actual: no assignment Decision is ever surfaced.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "D1" }, "D1")
      .unit(P2, "bf1", { might: 5, name: "D2 stunned wall" }, "D2", { stunned: true })
      .unit(P1, "base", { might: 3, name: "A1" }, "A1")
      .unit(P1, "base", { might: 3, name: "A2" }, "A2")
      .build();
    await game.p1.move(["A1", "A2"], "bf1");
    await passBoth(game);
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(["distribute", "pick", "order"]).toContain(d?.kind as string);
    if (d?.kind === "distribute") {
      await game.p1.distribute({ D1: 2, D2: 4 });
    } else if (d?.kind === "order") {
      await game.p1.order(["D1", "D2"]);
    } else {
      await game.p1.pick("D1");
    }
    const d2 = game.decision();
    expect(d2?.seat).toBe(P2);
    if (d2?.kind === "distribute") {
      expect((await game.p2.try((p) => p.distribute({ A1: 1, A2: 1 }))).ok).toBe(false);
      await game.p2.distribute({ A1: 2 });
    }
    await game.settle();
    expect(game.zoneOf("D1")).toBe("trash");
    expect(game.zoneOf("D2")).toBe("battlefield-bf1");
    expect(game.zoneOf("A1")).toBe("base");
    expect(game.zoneOf("A2")).toBe("base");
  });
});

// ===========================================================================
// The combat chain, focus and LIFO
// ===========================================================================

describe("Attack trigger creates a Combat Chain: state closes; damage waits; Focus does NOT pass when it empties (346.1)", () => {
  test("attack trigger goes on the combat chain controlled by P1 (464.2.e/464.2.e.1), state is Showdown Closed (464.2.f), no damage while chain non-empty; resolves → draw exactly once", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender D" }, "D")
      .unit(P1, "base", { abilities: [ATTACK_DRAW], might: 3, name: "Attacker A" }, "A")
      .build();
    const h = game.p1.hand().length;
    await game.p1.move("A", "bf1");

    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "A", controller: P1, triggered: true })]);
    expect(turnStateOf(game)).toBe("showdown-closed");
    expect(game.state("A").damage).toBe(0);
    expect(game.state("D").damage).toBe(0);
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });

    await game.p1.passPriority();
    // Still no damage while the chain has an item (460 / 465.2).
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    expect(game.state("D").damage).toBe(0);
    await game.p2.passPriority();
    expect(game.p1.hand().length).toBe(h + 1);
    expect(game.chain()).toEqual([]);
    expect(turnStateOf(game)).toBe("showdown-open");
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    expect(game.state("D").damage).toBe(0);

    // Finish: both pass focus → D (2) takes 3 lethal, A takes 2 non-lethal → conquer +1; the draw did not repeat.
    await game.acting().passFocus();
    await game.acting().passFocus();
    await game.settle();
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.locationOf("A")).toBe("bf1");
    expect(game.state("A").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand().length).toBe(h + 1);
  });

  test.failing("BUG: 346.1 — after a chain opened by a TRIGGERED ability empties during a showdown, Focus must stay with P1 (engine passes Focus to P2)", async () => {
    // Expected: Focus and priority remain with the attacker P1 (346.1, contrast 347.1.b).
    // Actual: focusPlayer becomes P2 once the trigger chain resolves.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender D" }, "D")
      .unit(P1, "base", { abilities: [ATTACK_DRAW], might: 3, name: "Attacker A" }, "A")
      .build();
    await game.p1.move("A", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(showdown(game)?.focusPlayer).toBe(P1);
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });
});

describe("A Might buff played during the combat showdown counts: damage uses CURRENT Might at close (465.2)", () => {
  test("might-buff-during-combat-showdown-counts-current-might-at-close-flips-outcome", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Defender D" }, "D")
      .unit(P1, "base", { might: 3, name: "Attacker A" }, "A")
      .hand(P2, buffSpell(1), "S")
      .build();
    await game.p1.move("A", "bf1");
    // P1 passes focus → P2 gains Focus (347.2.b) and may play an Action-timed spell (347.1).
    await game.p1.passFocus();
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(game.p2.can("cast", "S")).toBe(true);
    await game.p2.cast("S", { targets: "D" });
    expect(turnStateOf(game)).toBe("showdown-closed");
    await game.p2.passPriority();
    await game.p1.passPriority();
    // S resolved: D is Might 4; chain closed → Focus passes to P1 (347.1.b / 340.2.a).
    expect(game.zoneOf("S")).toBe("trash");
    expect(game.state("D").might).toBe(4);
    expect(turnStateOf(game)).toBe("showdown-open");
    expect(showdown(game)?.focusPlayer).toBe(P1);
    // Must NOT: the showdown did not close on P2's play (347.2.a / 348 need passes in sequence).
    expect(showdown(game)?.active).toBe(true);
    expect(game.state("A").damage).toBe(0);
    expect(game.state("D").damage).toBe(0);

    await game.p1.passFocus();
    expect(showdown(game)?.active).toBe(true);
    await game.p2.passFocus();
    await game.settle();
    // 465.2 with current Might: 3→D not lethal (needs 4); 4→A lethal.
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    expect(game.state("D").damage).toBe(0); // healed at combat cleanup (466.1.a.1)
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);

    // 317.2.c / 142.4.b: the +1 expires at end of turn.
    await game.advanceTurn();
    expect(game.state("D").might).toBe(3);
  });

  test("control: same setup, P2 never plays the buff → both die and bf1 becomes uncontrolled (the buff observably flipped the result)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Defender D" }, "D")
      .unit(P1, "base", { might: 3, name: "Attacker A" }, "A")
      .hand(P2, buffSpell(1), "S")
      .build();
    await game.p1.move("A", "bf1");
    await passBoth(game);
    await game.settle();
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.zoneOf("S")).toBe("hand");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });
});

describe("LIFO on the combat chain: a Reaction that kills the lone defender resolves before the buff; then no damage step and the attacker conquers unhurt", () => {
  test("ZAP (Reaction, played in response) resolves FIRST (340.1); D dies in the cleanup after it (319.5/323.5); BUFF then has no legal target (359.3.e.5)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Defender D" }, "D")
      .unit(P1, "base", { might: 1, name: "Attacker A" }, "A")
      .hand(P2, buffSpell(2), "BUFF")
      .hand(P1, ZAP, "ZAP")
      .build();
    await game.p1.move("A", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("BUFF", { targets: "D" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["BUFF"]);
    await game.p2.passPriority();
    // 338.1.a.2: P1, with priority in a Closed state, may respond with a Reaction.
    expect(game.p1.can("cast", "ZAP")).toBe(true);
    await game.p1.cast("ZAP", { targets: "D" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["BUFF", "ZAP"]);
    expect(game.state("D").damage).toBe(0);
    await game.p1.passPriority();
    await game.p2.passPriority();
    // ZAP resolved first: D (Might 3, not yet buffed) has taken 3 → killed before BUFF resolves.
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.chain().map((i) => i.cardId)).toEqual(["BUFF"]);
    // BUFF resolves with its target gone → no effect; D must NOT be alive with Might 5.
    await game.acting().passPriority();
    if (game.chain().length > 0) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.zoneOf("BUFF")).toBe("trash");
    // No combat damage was dealt to A at any point.
    expect(game.state("A").damage).toBe(0);
    expect(game.zoneOf("A")).not.toBe("trash");
  });

  test("with no Defending unit left there is NO damage step (465.1) and the lone attacker establishes control → Conquer +1 (466.3.a / 466.5 / 466.5.d)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Defender D" }, "D")
      .unit(P1, "base", { might: 1, name: "Attacker A" }, "A")
      .hand(P2, buffSpell(2), "BUFF")
      .hand(P1, ZAP, "ZAP")
      .build();
    await game.p1.move("A", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("BUFF", { targets: "D" });
    await game.p2.passPriority();
    await game.p1.cast("ZAP", { targets: "D" });
    await game.settle();
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.state("A").damage).toBe(0);
    expect(game.locationOf("A")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.state("A").combatRole).toBeNull();
  });

  test("counterfactual: BUFF played in response to ZAP resolves first → D is Might 5, ZAP's 3 is non-lethal, the damage step happens and A (Might 1) dies", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Defender D" }, "D")
      .unit(P1, "base", { might: 1, name: "Attacker A" }, "A")
      .hand(P2, { ...buffSpell(2), timing: "reaction", abilities: [{ ...buffSpell(2).abilities[0], timing: "reaction" }] }, "BUFF")
      .hand(P1, { ...ZAP, abilities: [{ ...ZAP.abilities[0], timing: "action" }], timing: "action" }, "ZAP")
      .build();
    await game.p1.move("A", "bf1");
    await game.p1.cast("ZAP", { targets: "D" });
    await game.p1.passPriority();
    await game.p2.cast("BUFF", { targets: "D" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ZAP", "BUFF"]);
    await game.settle();
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });
});

describe("Defender evacuates during the showdown: no damage step, the attacker conquers", () => {
  test("while combat is ongoing control does NOT change and Contested stays even though D left (190.4.b / 190.3.b); no damage is dealt to A", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Defender D" }, "D")
      .unit(P1, "base", { might: 1, name: "Attacker A" }, "A")
      .hand(P2, RETREAT, "R")
      .build();
    await game.p1.move("A", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("R", { targets: "D" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("D")).toBe("hand");
    // Mid-combat: still P2's battlefield, still contested, showdown still open with Focus back on P1.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(showdown(game)?.active).toBe(true);
    expect(showdown(game)?.focusPlayer).toBe(P1);
    expect(game.state("A").damage).toBe(0);
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    // 465.1 false → nothing dealt to A; A survives despite D's 5 Might; P2 scores nothing.
    expect(game.state("A").damage).toBe(0);
    expect(game.zoneOf("A")).not.toBe("trash");
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
  });

  test("defender-evacuates-during-showdown-no-damage-step-attacker-conquers: P1 is the only player with units → establishes control → Conquer +1, A stays, designations removed (466.5 / 466.5.d / 466.7.a)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Defender D" }, "D")
      .unit(P1, "base", { might: 1, name: "Attacker A" }, "A")
      .hand(P2, RETREAT, "R")
      .build();
    await game.p1.move("A", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("R", { targets: "D" });
    await game.settle();
    expect(game.zoneOf("D")).toBe("hand");
    expect(game.locationOf("A")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.state("A").combatRole).toBeNull();
  });
});

// ===========================================================================
// Recall is not a Move
// ===========================================================================

describe("Recall is not a Move (455/456): 'When I move' fires for the standard move only, never for the combat recall", () => {
  test("recall-is-not-a-move-move-trigger-fires-once-only", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Stunned Wall D" }, "D", { stunned: true })
      .unit(P1, "base", { abilities: [MOVE_DRAW], might: 2, name: "Mover A" }, "A")
      .build();
    const h = game.p1.hand().length;
    await game.p1.move("A", "bf1");
    // The move trigger is on the chain (Closed state); combat waits for an empty chain (460).
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "A", triggered: true })]);
    expect(game.state("D").damage).toBe(0);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand().length).toBe(h + 1);
    expect(game.gameState.unitsMovedThisTurn?.[P1]).toBe(1);

    // Both pass focus → 2→D non-lethal (423.1.c), 0→A (423.1.b) → both survive → A recalled (466.1.a.2).
    await game.acting().passFocus();
    await game.acting().passFocus();
    await game.settle();
    expect(game.zoneOf("A")).toBe("base");
    expect(game.state("A").isExhausted).toBe(true);
    expect(game.state("A").damage).toBe(0);
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    // 456 / 456.1: the recall did NOT trigger "When I move" — still exactly one draw, no chain item, no extra move counted.
    expect(game.p1.hand().length).toBe(h + 1);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.unitsMovedThisTurn?.[P1]).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });
});

// ===========================================================================
// Scoring edges
// ===========================================================================

describe("Re-taking a battlefield already scored this turn establishes control but is NOT a Conquer (466.5.d / 469.1 / 470)", () => {
  test("reconquering-a-battlefield-already-scored-this-turn-establishes-control-but-scores-nothing; Hold works normally next turn", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 3)
      .battlefield("bf1", { controller: P2, def: { abilities: [CONQUER_HERE_DRAW], name: "Hooked Field" }, inert: false })
      .unit(P2, "bf1", { might: 1, name: "Defender D" }, "D")
      .unit(P1, "base", { might: 3, name: "Attacker A" }, "A")
      .build();
    // SETUP: P1 already scored (and conquered) bf1 earlier this turn, then lost it to P2.
    patchState(game, (st) => {
      (st.scoredThisTurn as Record<string, string[]>)[P1] = ["bf1"];
      (st.conqueredThisTurn as Record<string, string[]>)[P1] = ["bf1"];
    });
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf1"]);
    const h = game.p1.hand().length;

    await game.p1.move("A", "bf1");
    await passBoth(game);
    await game.settle();
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.state("A").damage).toBe(0);
    // 466.5: P1 DOES establish control; contested cleared.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    // 466.5.d / 470: not a Conquer → no 4th point; 471.2.c: "When you conquer here" must NOT trigger.
    expect(game.p1.points()).toBe(3);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand().length).toBe(h);

    // 470 is per turn: after P2's turn, P1 (still controlling bf1) scores Hold at its next Beginning Phase (469.2).
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.points()).toBe(3);
    await game.advanceTurn(); // → P1: hold bf1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(4);
  });

  test("non-combat variant without state patch: P1 holds bf1 (scored), walks away (190.4.c → uncontrolled), walks back in → establishes control again but scores nothing (348.2.a.1 / 470)", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder U" }, "U")
      .unit(P1, "base", { might: 2, name: "Walker W" }, "W")
      .build();
    await game.advanceTurn(); // P1's turn begins: Hold bf1 → 3 points, scoredThisTurn=[bf1]
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(3);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf1"]);
    await game.p1.move("U", "base");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    await game.p1.move("W", "bf1");
    await game.settle();
    expect(game.locationOf("W")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(3);
  });
});

describe("The Final Point via a lone combat Conquer is refused (draw instead) unless every battlefield was scored this turn (471.1.b)", () => {
  test.failing("BUG: 471.1.b.1 — at VictoryScore−1 a Conquer without having scored every battlefield draws 1 instead of scoring (engine awards the 8th point and ends the game)", async () => {
    // Expected: points stay 7, P1 draws 1, game not over, P1 controls bf1, bf1 counts as scored this turn (470).
    // Actual: resolveFullCombat adds the point directly → 8 → P1 wins.
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Defender D" }, "D")
      .unit(P2, "bf2", { might: 1, name: "Far Defender" }, "D2")
      .unit(P1, "base", { might: 3, name: "Attacker A" }, "A")
      .build();
    const h = game.p1.hand().length;
    await game.p1.move("A", "bf1");
    await passBoth(game);
    await game.settle();
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand().length).toBe(h + 1);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.gameState.scoredThisTurn[P1]).toContain("bf1");
  });

  test.failing("BUG: 471.2.a — in the draw-instead case the battlefield was still Conquered, so 'When you conquer here' triggers fire while points stay 7", async () => {
    // Expected: points 7, hand +1 (draw-instead) +1 (conquer-here trigger) once it resolves.
    // Actual: the engine scores the 8th point and finishes the game.
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("bf1", { controller: P2, def: { abilities: [CONQUER_HERE_DRAW], name: "Hooked Field" }, inert: false })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Defender D" }, "D")
      .unit(P2, "bf2", { might: 1, name: "Far Defender" }, "D2")
      .unit(P1, "base", { might: 3, name: "Attacker A" }, "A")
      .build();
    const h = game.p1.hand().length;
    await game.p1.move("A", "bf1");
    await passBoth(game);
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand().length).toBe(h + 2);
  });

  test("Part B: every OTHER battlefield already scored this turn (held bf2 at Beginning Phase) → the combat Conquer at bf1 IS the Final Point: 7→8 and P1 wins; no draw-instead", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 6)
      .active(P2)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 1, name: "Defender D" }, "D")
      .unit(P1, "bf2", { might: 1, name: "Holder H" }, "H")
      .unit(P1, "base", { might: 3, name: "Attacker A" }, "A")
      .build();
    await game.advanceTurn(); // P1's Beginning Phase: Hold bf2 → 7
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf2"]);
    const h = game.p1.hand().length;

    await game.p1.move("A", "bf1");
    await passBoth(game);
    await game.settle();
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // 471.1.b.1: every battlefield scored → Final Point; 472: wins at the next cleanup.
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand().length).toBe(h);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});
