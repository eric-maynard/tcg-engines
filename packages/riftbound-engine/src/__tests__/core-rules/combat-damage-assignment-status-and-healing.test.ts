/**
 * Core rules — Combat fundamentals II: lethal-assignment legality, status
 * interactions, and WHEN marked damage heals. Card-independent: every unit,
 * spell and ability here is an inline filler definition.
 *
 * Rules covered
 *   142.4.a/b   Lethal Damage = non-zero marked damage ≥ Might (total marked, not fresh)
 *   143.2       Might is not reduced by damage; 143.2.a lethal → killed
 *   143.2.b     Might < 0 is treated as 0 when summing combat Might (143.2.b.1: actual value kept)
 *   143.3.a/b   Damage persists; healed only at end of turn (317.2.b) and Combat Cleanup (466.1.a.1)
 *   144.2       The Standard Move exhausts the moving unit
 *   317.2.a-c   Ending Special Cleanup: 3c Heal all Units, THEN 3d "this turn" effects expire
 *   319.5/319.6 Cleanups after a chain item leaves / objects enter the board — no heal step (323.*)
 *   323.4/323.5 Cleanup kills lethally-damaged units (Deathknell noted first); 323.6 control loss
 *   348.2       Non-Combat Showdown resolution is not a Combat Cleanup
 *   418.1.a     Any clearing of damage is Healing
 *   423.1.a.2   Stun ends in the end-of-turn cleanup; 423.1.b stunned adds 0 Might; 423.1.c still needs full lethal
 *   428.1.a.2   Passive Kill; 428.5.c/.c.1 cleanup kill attributed to the damaging spell's controller
 *   458.1       Recall leaves damage/statuses untouched
 *   465.2.a/b   Sum Might of ALL attackers / ALL defenders (no readiness condition)
 *   465.2.c     Assign exactly the summed Might; .c.1.a dealt simultaneously; .c.3 full lethal to one
 *               unit before the next (assigner chooses order); .c.4 no overkill while others remain;
 *               .c.6 obey Tank/Backline; .c.7 same-priority units in any order
 *   465.2.d     Deal the assigned damage
 *   466.1.a.1   Combat Cleanup 3c "Heal all Units"; 466.1.a.2 recall attackers if defenders remain
 *   466.3.a/d   Combat result (won / No Result); 466.5.b nobody left → Uncontrolled; 466.5.d conquer
 *   815.1.b/.c.2  Tank: lethal before any same-controller non-Tank (either side of the combat)
 *   826.3/826.4.b Backline: lethal only after every same-controller non-Backline unit
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

// ---------------------------------------------------------------------------
// Inline filler spells / units
// ---------------------------------------------------------------------------

function actionSpell(name: string, effect: Record<string, unknown>) {
  return {
    abilities: [{ effect, timing: "action", type: "spell" }],
    cardType: "spell",
    domain: "fury",
    energyCost: 0,
    name,
    timing: "action",
  };
}

/** "Deal N to a unit." */
const ping = (n: number) => actionSpell(`Ping ${n}`, { amount: n, target: { type: "unit" }, type: "damage" });
/** "Give a unit ±N Might this turn." */
const mightThisTurn = (name: string, n: number) =>
  actionSpell(name, { amount: n, duration: "turn", target: { type: "unit" }, type: "modify-might" });

const WITHER = mightThisTurn("Wither", -3);
const SHRINK = mightThisTurn("Shrink", -1);
const GROW = mightThisTurn("Grow", 2);

/** 3-Might unit with "Deathknell — Draw 1." (observes death timing). */
const DEATHKNELL_3 = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "die", on: "self" }, type: "triggered" }],
  might: 3,
  name: "Deathknell Dummy",
};

/** 1-Might bystander with "When you kill an enemy unit, draw 1." (observes kill attribution, 428.5.c.1). */
const KILLWATCH = {
  abilities: [
    {
      effect: { amount: 1, type: "draw" },
      trigger: { event: "die", on: { actor: "controller", controller: "enemy", type: "unit" } },
      type: "triggered",
    },
  ],
  might: 1,
  name: "Killwatch",
};

/** A moves alone from base into bf1 and both players pass focus → combat resolves. */
async function attackWith(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>, units: string | string[]) {
  await game.p1.move(units, "bf1");
  await game.settle();
}

// ---------------------------------------------------------------------------
// 1. Might contribution vs. unit status
// ---------------------------------------------------------------------------

describe("Combat Might is summed over ALL units regardless of readiness or marked damage (465.2.a/b, 143.2)", () => {
  test("an Exhausted defender contributes its full Might; it survives non-lethal damage, is healed at Combat Cleanup and stays exhausted", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Defender" }, "D", { exhausted: true })
      .unit(P1, "base", { might: 3, name: "Attacker" }, "A")
      .build();
    expect(game.state("D").isExhausted).toBe(true);
    expect(game.state("A").isReady).toBe(true);

    await game.p1.move("A", "bf1");
    // 144.2: the Standard Move exhausts the mover; attacker holds Focus first.
    expect(game.state("A").isExhausted).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    await game.settle();

    // 465.2.b has no readiness condition: D dealt 4 ≥ 3 → A dies; A dealt 3 < 4 → D lives.
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    // 466.1.a.1: combat damage on the survivor is healed.
    expect(game.state("D").damage).toBe(0);
    // Combat neither readies nor re-exhausts the defender.
    expect(game.state("D").isExhausted).toBe(true);
    // 466.3.a: P2 won; no control change, no points.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("a damaged unit still deals its full Might, and its pre-marked damage counts toward lethal (142.4.b, 143.2, 143.3.b)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      // 3 spell damage from earlier this turn legitimately persists into combat (143.3.b).
      .unit(P2, "bf1", { might: 4, name: "Defender" }, "D", { damage: 3 })
      .unit(P1, "base", { might: 3, name: "Attacker" }, "A")
      .build();
    expect(game.state("D").damage).toBe(3);
    expect(game.state("D").might).toBe(4); // Might is not reduced by damage

    await attackWith(game, "A");

    // Attackers 3 → D: 3+3 = 6 ≥ 4 → lethal. Defenders: D contributes 4 (not 4−3=1) → A (3) dies.
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.zoneOf("A")).toBe("trash");
    // 466.3.d No Result / 466.5.b: nobody remains → Uncontrolled; nobody scores.
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });
});

describe("Stunned units in combat (423.1.b/c, 423.1.a.2, 458.1, 466.1.a.2)", () => {
  function stunnedAttacker() {
    return scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Defender" }, "D")
      // Stunned but READY: 423 does not forbid the Standard Move.
      .unit(P1, "base", { might: 4, name: "Stunned Attacker" }, "A", { stunned: true });
  }

  test("a Stunned attacker may still make the Standard Move", async () => {
    const game = await stunnedAttacker().build();
    expect(game.state("A").isStunned).toBe(true);
    expect(game.p1.can("move")).toBe(true);
    await game.p1.move("A", "bf1");
    expect(game.zoneOf("A")).toBe("battlefield-bf1");
    expect(game.state("A").combatRole).toBe("attacker");
  });

  test("a Stunned attacker adds 0 Might but still needs FULL lethal; it survives 3<4, is recalled, and stays exhausted + stunned", async () => {
    const game = await stunnedAttacker().build();
    await attackWith(game, "A");

    // 423.1.b: attackers sum 0 → D takes nothing and survives.
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    expect(game.state("D").damage).toBe(0);
    // 423.1.c: 3 damage on a 4-Might stunned unit is NOT lethal → A lives.
    // 466.1.a.1 heal, 466.1.a.2 defenders present → A recalled to base.
    expect(game.zoneOf("A")).toBe("base");
    expect(game.state("A").damage).toBe(0);
    // 458.1: recall does not touch statuses — still exhausted (paid for the move) and still stunned.
    expect(game.state("A").isExhausted).toBe(true);
    expect(game.state("A").isStunned).toBe(true);
    // 466.3.d No Result; P2 keeps bf1; nobody scores.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("the Stunned status is removed during the end-of-turn cleanup (423.1.a.2), not before", async () => {
    const game = await stunnedAttacker().build();
    await attackWith(game, "A");
    expect(game.state("A").isStunned).toBe(true); // not cleared by recall / combat cleanup
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("A")).toBe("base");
    expect(game.state("A").isStunned).toBe(false);
  });
});

describe("Might reduced below zero (143.2.b, 143.2.b.1, 142.4.b)", () => {
  test("a −1 Might attacker is treated as 0: contributes nothing, is not dead at 0 damage, and dies to a single point of damage", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Defender" }, "D")
      .unit(P1, "base", { might: 2, name: "Attacker" }, "A")
      .hand(P2, WITHER, "wither")
      .build();

    await game.p1.move("A", "bf1");
    await game.p1.passFocus();
    // P2 has Focus in the showdown and plays the Action-speed Wither on A.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.cast("wither", { targets: "A" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("wither")).toBe("trash");

    // 143.2.b.1: the actual modifier is −3 (2−3 = −1) but the referenced Might reads 0.
    expect(game.state("A").mightModifier).toBe(-3);
    expect(game.state("A").might).toBe(0);
    // 142.4.b: 0 damage is never lethal — A is still on the battlefield after the spell's cleanup.
    expect(game.zoneOf("A")).toBe("battlefield-bf1");
    expect(game.state("A").damage).toBe(0);

    // Both pass → combat damage: attackers sum 0 → D untouched; defenders 1 → A: 1 ≥ 0 → lethal.
    await game.settle();
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    expect(game.state("D").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("a negative-Might unit does not subtract from its side's total: teammate's 2 Might still lands in full", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender" }, "D")
      .unit(P1, "base", { might: 2, name: "Withered" }, "A1")
      .unit(P1, "base", { might: 2, name: "Buddy" }, "A2")
      .hand(P2, WITHER, "wither")
      .build();

    await game.p1.move(["A1", "A2"], "bf1");
    await game.p1.passFocus();
    await game.p2.cast("wither", { targets: "A1" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("A1").might).toBe(0);
    await game.settle();

    // Attackers sum max(0,−1) + 2 = 2 (not 1) → D (2) dies. Defenders 2 → assigned among A1/A2.
    expect(game.zoneOf("D")).toBe("trash");
    // At least one attacker survives → P1 conquers.
    expect(game.p1.units("bf1").length).toBeGreaterThanOrEqual(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Lethal-assignment legality
// ---------------------------------------------------------------------------

describe("Lethal must be completed on one unit before the next; no overkill while others remain (465.2.c.3/.c.4)", () => {
  function twoThrees() {
    return scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "D1" }, "D1")
      .unit(P2, "bf1", { might: 3, name: "D2" }, "D2")
      .unit(P1, "base", { might: 5, name: "Attacker" }, "A");
  }

  test("5 damage into two 3-Might defenders: exactly one receives lethal (3) and dies, the other takes the remaining 2 and is healed; never a 2/2 spread, never both dead", async () => {
    const game = await twoThrees().build();
    await attackWith(game, "A");

    const dead = ["D1", "D2"].filter((d) => game.zoneOf(d) === "trash");
    const alive = ["D1", "D2"].filter((d) => game.zoneOf(d) === "battlefield-bf1");
    expect(dead).toHaveLength(1); // not 0 (2/2 spread) and not 2 (overkill impossible: 5 < 6)
    expect(alive).toHaveLength(1);
    // 466.1.a.1: the survivor's 2 combat damage is healed.
    expect(game.state(alive[0] as string).damage).toBe(0);
    // Defenders dealt 6 ≥ 5 → A dies; P2 won (466.3.a), keeps bf1, nobody scores.
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test.failing("BUG: 465.2.c.3 — the ATTACKER chooses which defender receives lethal first; engine auto-assigns without surfacing a decision to P1", async () => {
    // Expected: after both players pass, P1 is prompted to distribute 5 damage among D1/D2;
    // {D1:5}, {D1:4,D2:1} (overkill while D2 lacks lethal, 465.2.c.4) and any total ≠ 5 are
    // rejected; {D1:3,D2:2} / {D1:2,D2:3} are accepted. Actual: combat resolves instantly.
    const game = await twoThrees().build();
    await game.p1.move("A", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1 });
    expect((await game.p1.try((p) => p.distribute({ D1: 5, D2: 0 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.distribute({ D1: 4, D2: 1 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.distribute({ D1: 2, D2: 2 }))).ok).toBe(false);
    await game.p1.distribute({ D1: 2, D2: 3 }); // P1 elects D2 as the unit that dies
    await game.settle();
    expect(game.zoneOf("D2")).toBe("trash");
    expect(game.zoneOf("D1")).toBe("battlefield-bf1");
    expect(game.state("D1").damage).toBe(0);
    expect(game.zoneOf("A")).toBe("trash");
  });

  test("excess damage may be piled on once every unit has lethal: 7 into two 2-Might defenders kills both; the attacker survives 4, is healed, stays and conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "D1" }, "D1")
      .unit(P2, "bf1", { might: 2, name: "D2" }, "D2")
      .unit(P1, "base", { might: 7, name: "Attacker" }, "A")
      .build();
    await attackWith(game, "A");

    expect(game.zoneOf("D1")).toBe("trash");
    expect(game.zoneOf("D2")).toBe("trash");
    // Defenders dealt 4 < 7: A lives, healed (466.1.a.1), NOT recalled (no defenders remain), conquers (466.5.d).
    expect(game.zoneOf("A")).toBe("battlefield-bf1");
    expect(game.state("A").damage).toBe(0);
    expect(game.state("A").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
  });

  test("pre-damaged defenders (465.2.c.4's example): 5 into four 3-Might units each carrying 1 → lethal is 2 apiece, so exactly two die; the rest are healed to 0 by the Combat Cleanup — including old spell damage combat never touched", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "D1" }, "D1", { damage: 1 })
      .unit(P2, "bf1", { might: 3, name: "D2" }, "D2", { damage: 1 })
      .unit(P2, "bf1", { might: 3, name: "D3" }, "D3", { damage: 1 })
      .unit(P2, "bf1", { might: 3, name: "D4" }, "D4", { damage: 1 })
      .unit(P1, "base", { might: 5, name: "Attacker" }, "A")
      .build();
    for (const d of ["D1", "D2", "D3", "D4"]) {
      expect(game.state(d).damage).toBe(1);
    }
    await attackWith(game, "A");

    const ds = ["D1", "D2", "D3", "D4"];
    const dead = ds.filter((d) => game.zoneOf(d) === "trash");
    const alive = ds.filter((d) => game.zoneOf(d) === "battlefield-bf1");
    // 2+2 lethal on two units, 1 left over on a third (non-lethal: 1+1 < 3), fourth untouched.
    // Requiring 3 FRESH damage per unit would kill only one; allowing 3 on a pre-damaged unit likewise.
    expect(dead).toHaveLength(2);
    expect(alive).toHaveLength(2);
    // 466.1.a.1 / 418.1.a: "Heal all Units" — both survivors at 0, even the one whose only damage was the old spell point.
    for (const d of alive) {
      expect(game.state(d).damage).toBe(0);
    }
    // Defenders 12 → A dies; P2 holds.
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });
});

describe("Tank first, plain next, Backline last — on either side of the combat (815, 826, 465.2.c.6/.c.7)", () => {
  test("attacker with 3 into Tank(2) / plain(1) / Backline(1): the only legal line is Tank 2 → plain 1; Tank and plain die, the Backline unit is never touched", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      // Declared Backline-first / Tank-last so zone order cannot masquerade as keyword order.
      .unit(P2, "bf1", { keywords: ["Backline"], might: 1, name: "Backliner" }, "B")
      .unit(P2, "bf1", { might: 1, name: "Plain" }, "N")
      .unit(P2, "bf1", { keywords: ["Tank"], might: 2, name: "Tank" }, "T")
      .unit(P1, "base", { might: 3, name: "Attacker" }, "A")
      .build();
    expect(game.state("T").keywords).toContain("Tank");
    expect(game.state("B").keywords).toContain("Backline");
    await attackWith(game, "A");

    // 815.1.b: Tank takes lethal (exactly 2, 465.2.c.4) first; 826.4.b: plain N before Backline B; 465.2.c.3: the last point completes N's lethal.
    expect(game.zoneOf("T")).toBe("trash");
    expect(game.zoneOf("N")).toBe("trash");
    expect(game.zoneOf("B")).toBe("battlefield-bf1");
    expect(game.state("B").damage).toBe(0);
    // Defenders 4 ≥ 3 → A dies; P2 keeps bf1.
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("with equal 2-Might Tank / plain / Backline defenders and 3 to assign, only the Tank can be the casualty; the leftover point lands on the plain unit and is healed", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { keywords: ["Backline"], might: 2, name: "Backliner" }, "B")
      .unit(P2, "bf1", { might: 2, name: "Plain" }, "N")
      .unit(P2, "bf1", { keywords: ["Tank"], might: 2, name: "Tank" }, "T")
      .unit(P1, "base", { might: 3, name: "Attacker" }, "A")
      .build();
    await attackWith(game, "A");

    expect(game.zoneOf("T")).toBe("trash");
    expect(game.zoneOf("N")).toBe("battlefield-bf1");
    expect(game.zoneOf("B")).toBe("battlefield-bf1");
    expect(game.state("N").damage).toBe(0);
    expect(game.state("B").damage).toBe(0);
    expect(game.zoneOf("A")).toBe("trash"); // 6 ≥ 3
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("Tank binds the DEFENDER too: assigning 4 to attackers Tank(3) + plain(3) must kill the Tank and leave the plain attacker on 1 (healed); it stays and conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Defender" }, "D")
      .unit(P1, "base", { might: 3, name: "Plain Attacker" }, "A2")
      .unit(P1, "base", { keywords: ["Tank"], might: 3, name: "Tank Attacker" }, "A1")
      .build();
    await game.p1.move(["A1", "A2"], "bf1");
    expect(game.zoneOf("A1")).toBe("battlefield-bf1");
    expect(game.zoneOf("A2")).toBe("battlefield-bf1");
    await game.settle();

    // Attackers 6 ≥ 4 → D dies. Defenders 4: {A1:3, A2:1} is the only legal shape (815.1.b is side-agnostic).
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.zoneOf("A1")).toBe("trash");
    expect(game.zoneOf("A2")).toBe("battlefield-bf1"); // not killed instead of the Tank, not recalled
    expect(game.state("A2").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("two Tanks: either may be first, but the cheap 1-Might non-Tank is never assigned anything while a Tank lacks lethal (815.1.c.2, 465.2.c.7)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Plain" }, "N")
      .unit(P2, "bf1", { keywords: ["Tank"], might: 2, name: "Tank One" }, "T1")
      .unit(P2, "bf1", { keywords: ["Tank"], might: 3, name: "Tank Two" }, "T2")
      .unit(P1, "base", { might: 3, name: "Attacker" }, "A")
      .build();
    await attackWith(game, "A");

    // Legal lines: {T1:2, T2:1} or {T2:3}. In both, exactly one Tank dies and N is untouched.
    const deadTanks = ["T1", "T2"].filter((t) => game.zoneOf(t) === "trash");
    expect(deadTanks).toHaveLength(1);
    expect(game.zoneOf("N")).toBe("battlefield-bf1");
    expect(game.state("N").damage).toBe(0);
    const liveTank = deadTanks[0] === "T1" ? "T2" : "T1";
    expect(game.zoneOf(liveTank)).toBe("battlefield-bf1");
    expect(game.state(liveTank).damage).toBe(0); // healed at Combat Cleanup
    // Defenders 6 → A dies; P2 holds.
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test.failing("BUG: 465.2.c.7 — with two Tanks the attacker chooses which Tank takes lethal first; engine auto-picks without offering P1 the choice", async () => {
    // Expected: P1 is prompted and may elect {T2:3} (killing the 3-Might Tank) instead of {T1:2,T2:1};
    // {N:1,...} is rejected while a Tank lacks lethal (815.1.c.2). Actual: no prompt, T1 always dies.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Plain" }, "N")
      .unit(P2, "bf1", { keywords: ["Tank"], might: 2, name: "Tank One" }, "T1")
      .unit(P2, "bf1", { keywords: ["Tank"], might: 3, name: "Tank Two" }, "T2")
      .unit(P1, "base", { might: 3, name: "Attacker" }, "A")
      .build();
    await game.p1.move("A", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1 });
    expect((await game.p1.try((p) => p.distribute({ N: 1, T1: 2, T2: 0 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.distribute({ N: 0, T1: 3, T2: 0 }))).ok).toBe(false); // overkill on T1
    await game.p1.distribute({ N: 0, T1: 0, T2: 3 });
    await game.settle();
    expect(game.zoneOf("T2")).toBe("trash");
    expect(game.zoneOf("T1")).toBe("battlefield-bf1");
    expect(game.zoneOf("N")).toBe("battlefield-bf1");
  });
});

// ---------------------------------------------------------------------------
// 3. When damage heals
// ---------------------------------------------------------------------------

describe("Combat Cleanup heals ALL units at ALL locations (466.1.a.1, 143.3.b.2, 418.1)", () => {
  test("participants: the surviving attacker's combat damage is gone immediately after combat (still P1's Main Phase)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender" }, "D")
      .unit(P1, "base", { might: 3, name: "Attacker" }, "A")
      .build();
    await attackWith(game, "A");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.zoneOf("A")).toBe("battlefield-bf1");
    expect(game.state("A").damage).toBe(0); // took 2, healed at 3c
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("466.1.a.1 — 'Heal all Units' has no location qualifier: a damaged unit in P1's BASE and a damaged P2 unit at ANOTHER battlefield are healed by the Combat Cleanup at bf1 (engine heals only the combatants)", async () => {
    // Expected: X (base, 2 dmg) and Y (bf2, 1 dmg) read 0 damage right after the bf1 combat.
    // Actual: resolveFullCombat clears damage only on the attacker/defender units at bf1.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender" }, "D")
      .unit(P1, "base", { might: 3, name: "Attacker" }, "A")
      .unit(P1, "base", { might: 3, name: "Wounded Homebody" }, "X", { damage: 2 })
      .unit(P2, "bf2", { might: 4, name: "Wounded Elsewhere" }, "Y", { damage: 1 })
      .build();
    expect(game.state("X").damage).toBe(2);
    expect(game.state("Y").damage).toBe(1);

    await attackWith(game, "A"); // only A moves
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    // The combat itself went as normal …
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.zoneOf("A")).toBe("battlefield-bf1");
    expect(game.state("A").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // … bystanders are otherwise untouched …
    expect(game.zoneOf("X")).toBe("base");
    expect(game.state("X").isReady).toBe(true);
    expect(game.zoneOf("Y")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    // … but HEALED by Combat Cleanup step 3c.
    expect(game.state("X").damage).toBe(0);
    expect(game.state("Y").damage).toBe(0);
  });
});

describe("Non-combat damage persists through ordinary Cleanups and heals only in the Ending Phase (143.3, 317.2, 323, 348.2)", () => {
  function pinged() {
    return scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", { might: 3, name: "Defender" }, "D")
      .unit(P1, "base", { might: 2, name: "Runner" }, "R")
      .hand(P1, ping(2), "ping")
      .hand(P1, { energyCost: 0, might: 1, name: "Cheap Filler" }, "U");
  }

  test("2 damage on a 3-Might unit survives: the spell's own cleanup, a unit entering the board (319.6), and a Non-Combat Showdown conquer elsewhere (348.2) — none of them heal", async () => {
    const game = await pinged().build();
    await game.p1.cast("ping", { targets: "D" });
    await game.settle();
    expect(game.zoneOf("ping")).toBe("trash");
    expect(game.zoneOf("D")).toBe("battlefield-bf1"); // 2 < 3: alive
    expect(game.state("D").damage).toBe(2);

    // 319.6: playing a unit causes a Cleanup — ordinary Cleanups (323.*) have no heal step.
    await game.p1.play("U");
    await game.settle();
    expect(game.zoneOf("U")).toBe("base");
    expect(game.state("D").damage).toBe(2);

    // Standard Move into an EMPTY uncontrolled battlefield → Non-Combat Showdown → P1 conquers bf2.
    await game.p1.move("R", "bf2");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    // 348.2 is not a Combat Cleanup: still no heal.
    expect(game.state("D").damage).toBe(2);
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("317.2.b — the Ending Special Cleanup heals all units: by P2's turn D reads 0 damage", async () => {
    const game = await pinged().build();
    await game.p1.cast("ping", { targets: "D" });
    await game.settle();
    expect(game.state("D").damage).toBe(2);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("D")).toBe("battlefield-bf1"); // never killed
    expect(game.state("D").damage).toBe(0);
  });
});

describe("Damage accumulates across separate chains within a turn and kills at the next Cleanup (143.2.a, 319.5, 323.4-6, 428.5.c)", () => {
  test("Ping 2 then, later, Ping 1 on a 3-Might Deathknell unit: alive after the first, killed in the cleanup after the second; Deathknell fires; its battlefield becomes Uncontrolled; the kill is P1's; nobody scores", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", DEATHKNELL_3, "D")
      .unit(P1, "base", KILLWATCH, "watch") // "When you kill an enemy unit, draw 1."
      .hand(P1, ping(2), "ping2")
      .hand(P1, ping(1), "ping1")
      .hand(P1, { energyCost: 0, might: 1, name: "Cheap Filler" }, "U")
      .build();
    const p1Deck = game.p1.deck().length;
    const p2Hand = game.p2.hand().length;

    await game.p1.cast("ping2", { targets: "D" });
    await game.settle();
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    expect(game.state("D").damage).toBe(2);
    expect(game.p2.hand()).toHaveLength(p2Hand); // no Deathknell yet
    expect(game.p1.deck()).toHaveLength(p1Deck); // no kill yet

    // Unrelated action in between (its cleanup must not reset D's damage).
    await game.p1.play("U");
    await game.settle();
    expect(game.state("D").damage).toBe(2);

    await game.p1.cast("ping1", { targets: "D" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ping1"]);
    expect(game.zoneOf("D")).toBe("battlefield-bf1"); // not dead while Ping 1 is still on the chain
    await game.settle();

    // 2+1 = 3 ≥ 3 → Passive Kill in the Cleanup after Ping 1 leaves the chain (319.5, 323.5, 428.1.a.2).
    expect(game.zoneOf("ping1")).toBe("trash");
    expect(game.zoneOf("D")).toBe("trash");
    // 323.4: Deathknell noted and resolved → P2 drew 1.
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    // 428.5.c/.c.1: the kill is attributed to Ping 1 / P1 → P1's "when you kill" observer drew 1.
    expect(game.p1.deck()).toHaveLength(p1Deck - 1);
    // 323.6 / 190.4.c: P2 has no units at bf1 in an Open state → loses control; P1 established nothing.
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

describe("Lethal is re-checked against CURRENT Might (142.4.a/b, 323.5, 317.2.b→c ordering)", () => {
  test("−1 Might on a 4-Might unit carrying 3 damage makes that damage lethal: killed in the following Cleanup with no new damage; its battlefield becomes Uncontrolled (323.6)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Bruised" }, "D", { damage: 3 })
      .hand(P1, SHRINK, "shrink")
      .build();
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    expect(game.state("D").damage).toBe(3);

    await game.p1.cast("shrink", { targets: "D" });
    expect(game.zoneOf("D")).toBe("battlefield-bf1"); // nothing happens until Shrink resolves
    await game.settle();
    expect(game.zoneOf("shrink")).toBe("trash");
    // 142.4.b (Frigid Touch example): Might 3 with 3 marked → lethal → 323.5 kill.
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
  });

  test("the inverse at end of turn: a 2-Might unit given +2 this turn and dealt 3 survives (3 < 4) and must NOT die when the buff expires — 3c heals BEFORE 3d expires 'this turn' effects (317.2.b, 317.2.c)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Pumped" }, "D")
      .hand(P1, GROW, "grow")
      .hand(P1, ping(3), "ping3")
      .build();
    await game.p1.cast("grow", { targets: "D" });
    await game.settle();
    expect(game.state("D").might).toBe(4);
    await game.p1.cast("ping3", { targets: "D" });
    await game.settle();
    expect(game.zoneOf("D")).toBe("battlefield-bf1"); // 3 < 4
    expect(game.state("D").damage).toBe(3);

    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    // Buff expired (back to 2) yet the unit is alive: the heal preceded the expiry.
    expect(game.state("D").might).toBe(2);
    expect(game.state("D").mightModifier).toBe(0);
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    expect(game.p2.trash()).not.toContain("D");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
