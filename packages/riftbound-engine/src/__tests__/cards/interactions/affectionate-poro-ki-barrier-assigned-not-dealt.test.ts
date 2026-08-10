/**
 * Interaction: Affectionate Poro (ven-024-166) · Unit · Calm · 3 · 3 Might
 *     "When a combat that I was in ends, if I haven't been dealt damage this turn, draw 1."
 *   × Ki Barrier (ven-126-166) · Spell (Reaction) · Order · 2 + [order]
 *     "Choose a unit. Prevent the next 7 damage that would be dealt to it this turn.
 *      (Opponents can assign it extra combat damage to kill it.)"
 *   × vanilla attackers: Vanguard Sergeant (ogn-219-298, 4), Mega-Mech (ogn-088-298, 8),
 *     Mountain Drake (ogn-142-298, 10).
 *
 * Rules: 437.5 / 437.5.a (a unit under Prevent is still ASSIGNED combat damage; its lethal threshold
 * counts the Prevent Value), 465.2.c.5 (replacements apply to the assignment), 437.2 / 437.2.a (dealt
 * amount = assigned − PV, floor 0), 437.3 / 437.3.a (PV counts down; expires at 0), 437.4 (fully
 * prevented damage was never dealt), 417.1.a (assigning ≠ dealing), 417.1.e / 417.1.e.1 (only valid ≥1
 * damage is dealt), 466.1.a.2 (attackers recalled if defenders remain), 466.3.a (winner), 466.7.b
 * (end-of-combat triggers).
 *
 * Question: P2's Poro defends bf1 alone with a resolved Ki Barrier (prevent next 7). (a) Sergeant 4
 * attacks — must the 4 still be assigned? was the Poro "dealt damage"? draw? who keeps bf1? (b) Mega-Mech
 * 8. (c) Mountain Drake 10. (d) control: Sergeant 4, no barrier.
 * Expected: (a) 4 assigned, 0 dealt (PV 7→3) → not dealt damage; Sergeant takes 3, survives, recalled;
 * P2 keeps bf1; trigger fires, condition true → P2 draws 1. (b) 8−7 = 1 dealt, barrier spent; Poro lives
 * (healed), Mech recalled, P2 keeps bf1; WAS dealt damage → no draw. (c) 10−7 = 3 = lethal → Poro dies,
 * Drake conquers (+1 P1); Poro off-board when combat ends → no trigger, no draw. (d) 4 ≥ 3 → Poro dies,
 * Sergeant conquers, no draw.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, DistributeDecision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AFFECTIONATE_PORO = "ven-024-166";
const KI_BARRIER = "ven-126-166";
const VANGUARD_SERGEANT = "ogn-219-298"; // 4 Might, vanilla
const MEGA_MECH = "ogn-088-298"; // 8 Might, vanilla
const MOUNTAIN_DRAKE = "ogn-142-298"; // 10 Might, vanilla

/**
 * P1's turn. P2 holds bf1 with a lone Affectionate Poro (3) and — when `withBarrier` — Ki Barrier in hand
 * with exactly 2 + [order]. P1 has the named attacker ready in base. Both hands otherwise empty.
 */
function board(attacker: string, withBarrier = true) {
  const s = scenario()
    .resources(P2, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", AFFECTIONATE_PORO, "poro")
    .unit(P1, "base", attacker, "atk");
  return withBarrier ? s.hand(P2, KI_BARRIER, "ki") : s;
}

/** atk attacks bf1; P1 passes Focus; P2 casts Ki Barrier on the Poro and it resolves. Showdown still open, P1 has Focus. */
async function attackUnderBarrier(attacker: string): Promise<Game> {
  const game = await board(attacker).build();
  await game.p1.move("atk", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  await game.p2.cast("ki", { targets: "poro" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("ki")).toBe("trash");
  expect(game.state("poro").meta.damagePreventionShield).toBe(7);
  expect(game.chain()).toEqual([]);
  return game;
}

/** Pass Focus around until the showdown closes; stop at the first non-pass prompt or the open main phase. */
async function closeShowdown(game: Game): Promise<Decision | null> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main" || !d.passKey) {
      return d;
    }
    if (d.context !== "showdown") {
      return d;
    }
    await game.seat(d.seat).pass();
  }
  return game.decision();
}

/** The dealt-damage records for one unit this game (public state). */
function dealtTo(game: Game, unit: string) {
  return (game.gameState.damageLog ?? []).filter((r) => r.target === unit);
}

describe("Affectionate Poro × Ki Barrier — assigned is not dealt (437.4/437.5)", () => {
  // ── (a) Vanguard Sergeant 4 into PV 7 ────────────────────────────────────────────────────────

  test("(a) Sergeant 4: the 4 IS assigned to the lone Poro and entirely prevented — 0 dealt (437.2.a), PV 7 → 3 (437.3), no damage record for the Poro, 'dealt damage this turn' stays false (437.4)", async () => {
    const game = await attackUnderBarrier(VANGUARD_SERGEANT);
    await closeShowdown(game);
    // Combat damage has been exchanged; we are at the Poro's end-of-combat trigger (or later).
    expect(dealtTo(game, "poro")).toEqual([]);
    expect(game.state("poro").meta.dealtDamageThisTurn).not.toBe(true);
    expect(game.state("poro").meta.damagePreventionShield).toBe(3);
    // The Poro's 3 into the Sergeant is ordinary valid damage.
    expect(dealtTo(game, "atk")).toEqual([expect.objectContaining({ amount: 3, combat: true })]);
  });

  test("(a) Sergeant 4: both survive → attacker recalled to base (466.1.a.2), P2 keeps bf1 uncontested, nobody scores; everyone healed at cleanup", async () => {
    const game = await attackUnderBarrier(VANGUARD_SERGEANT);
    await closeShowdown(game);
    await game.settle();
    expect(game.locationOf("atk")).toBe("base");
    expect(game.locationOf("poro")).toBe("bf1");
    expect(game.state("atk").damage).toBe(0);
    expect(game.state("poro").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("(a) Sergeant 4: when the combat ends the Poro's trigger goes on the chain as P2's item (respondable — P2 then P1 get priority), the intervening-if is true → P2 draws exactly 1", async () => {
    const game = await attackUnderBarrier(VANGUARD_SERGEANT);
    const p2Hand = game.p2.hand().length; // Ki Barrier already spent
    const p1Hand = game.p1.hand().length;
    const stop = await closeShowdown(game);
    expect(stop).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P2, triggered: true, type: "ability" })]);
    expect(game.p2.hand()).toHaveLength(p2Hand); // not drawn before it resolves
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(a′) 437.5.a made observable: beside a 1-Might buddy, an 8-Might attacker IS asked to assign, and the Poro's lethal threshold is 3 + PV 7 = 10 (the buddy's is 1)", async () => {
    const game = await scenario()
      .resources(P2, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", AFFECTIONATE_PORO, "poro")
      .unit(P2, "bf1", { might: 1, name: "Buddy" }, "buddy")
      .unit(P1, "base", MEGA_MECH, "atk")
      .hand(P2, KI_BARRIER, "ki")
      .build();
    await game.p1.move("atk", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("ki", { targets: "poro" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    const d = await closeShowdown(game);
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 8 });
    const buckets = (d as DistributeDecision).buckets.map((b) => [b.card, b.lethal]).sort();
    expect(buckets).toEqual([
      ["buddy", 1],
      ["poro", 10],
    ]);
    // 465.2.c.3: lethal must be met on a unit before moving on — 1 to Buddy then the rest on the Poro is legal…
    await game.p1.distribute({ buddy: 1, poro: 7 });
    await game.settle();
    expect(game.zoneOf("buddy")).toBe("trash");
    expect(game.locationOf("poro")).toBe("bf1"); // 7 assigned, 7 prevented → 0 dealt
    expect(dealtTo(game, "poro")).toEqual([]);
    expect(game.state("poro").meta.dealtDamageThisTurn).not.toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  // ── (b) Mega-Mech 8 into PV 7 ───────────────────────────────────────────────────────────────

  test("(b) Mega-Mech 8: 8 assigned, 7 prevented → exactly 1 valid damage dealt (417.1.e); Ki Barrier is spent and expires (437.3.a); the Poro WAS dealt damage this turn", async () => {
    const game = await attackUnderBarrier(MEGA_MECH);
    await closeShowdown(game);
    expect(dealtTo(game, "poro")).toEqual([
      expect.objectContaining({ amount: 1, combat: true, modifiedBy: [expect.objectContaining({ after: 1, before: 8, kind: "prevent", sourceCardId: "ki" })], original: 8 }),
    ]);
    expect(game.state("poro").meta.dealtDamageThisTurn).toBe(true);
    expect(game.state("poro").meta.damagePreventionShield ?? 0).toBe(0);
  });

  test("(b) Mega-Mech 8: 1 < 3 so the Poro survives (healed to 0 at cleanup); Mech takes 3 of 8, survives, is recalled; P2 keeps bf1 — and NO draw: the intervening-if is false", async () => {
    const game = await attackUnderBarrier(MEGA_MECH);
    const p2Hand = game.p2.hand().length;
    await closeShowdown(game);
    await game.settle();
    expect(game.locationOf("poro")).toBe("bf1");
    expect(game.state("poro").damage).toBe(0);
    expect(game.locationOf("atk")).toBe("base");
    expect(game.state("atk").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (c) Mountain Drake 10 into PV 7 ─────────────────────────────────────────────────────────

  test("(c) Mountain Drake 10: 10 assigned, 7 prevented → 3 dealt = lethal; the Poro dies in the cleanup, Drake holds bf1 and conquers (+1 P1); the Poro is gone when the combat ends → its ability never triggers, no draw", async () => {
    const game = await attackUnderBarrier(MOUNTAIN_DRAKE);
    const p2Hand = game.p2.hand().length;
    const stop = await closeShowdown(game);
    // No end-of-combat chain item for the dead Poro.
    expect(game.chain()).toEqual([]);
    expect(stop).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(dealtTo(game, "poro")).toEqual([expect.objectContaining({ amount: 3, original: 10 })]);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p2.trash()).toContain("poro");
    expect(game.locationOf("atk")).toBe("bf1");
    expect(game.state("atk").damage).toBe(0); // took 3 of 10, healed
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.hand()).toHaveLength(p2Hand);
  });

  // ── (d) control: no barrier ─────────────────────────────────────────────────────────────────

  test("(d) control — Sergeant 4, no Ki Barrier: 4 dealt ≥ 3 → the Poro dies, Sergeant (takes 3) survives and conquers bf1 (+1 P1); no trigger, no draw", async () => {
    const game = await board(VANGUARD_SERGEANT, false).build();
    const p2Hand = game.p2.hand().length;
    await game.p1.move("atk", "bf1");
    await closeShowdown(game);
    await game.settle();
    expect(dealtTo(game, "poro")).toEqual([expect.objectContaining({ amount: 4, modifiedBy: [], original: 4 })]);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.locationOf("atk")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.violations()).toEqual([]);
  });
});
