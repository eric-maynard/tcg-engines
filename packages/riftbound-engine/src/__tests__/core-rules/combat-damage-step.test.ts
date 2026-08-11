/**
 * Core rules — Combat fundamentals: staging, the combat showdown, and the COMBAT DAMAGE STEP
 * (assignment order, simultaneity, Tank/Backline, stun/exhaust, replacements).
 *
 * CARD-INDEPENDENT: every unit, spell and ability below is an inline filler definition.
 *
 * Rules covered (riftbound-rules ids)
 *   142.4.a/b        Lethal Damage = non-zero marked damage ≥ Might (total marked, not fresh)
 *   143.2.b/.b.1     Might < 0 counts as 0 when summing; the real value is kept for later math
 *   143.3/.b         damage persists; healed only at end of turn or in a Combat Cleanup
 *   143.4            units enter the board exhausted
 *   144.2/144.4.a    the Standard Move exhausts the mover
 *   190.3.a.1/190.4.b Contested applied by the mover; control cannot change mid-combat
 *   323.2/.a/.c      designations are (re)stamped in cleanups, only at the combat's battlefield
 *   323.4/323.5      cleanup: deaths noted, lethally-damaged units killed
 *   323.8/323.9/323.12/323.13  cleanup stages a Showdown / a Combat and begins them
 *   337.1.b/339.1/340.1/340.2.a/346.1  chain finalization order vs LIFO resolution; Focus after a
 *                    trigger-opened chain does NOT pass
 *   344.1/345/347.2.a/348/348.1  showdown opens/closes; a closed Combat Showdown → damage step
 *   423.1.b/.c       Stunned adds 0 Might but still needs FULL lethal
 *   446.3/.c         the move is instantaneous and is not placed on the chain
 *   450/453/461/461.3  Contested status, cleanup on move completion, who initiates
 *   464.1/464.2.b-g  combat opens: attacker/defender, designations, Focus, the Combat Chain
 *   465.1            no damage step unless BOTH sides still have units there
 *   465.2/.a/.b      sum current Might of all attackers / all defenders
 *   465.2.c          attacker assigns first; .c.1/.c.1.a assigning ≠ dealing, dealt simultaneously
 *   465.2.c.3/.c.4   full lethal to one unit before the next; no overkill while units remain
 *   465.2.c.4.a/.c.5 replacements apply to the ASSIGNMENT; pick the minimum applied lethal value
 *   465.2.c.6-.c.9   obey Tank/Backline; same-priority units in any order; exclusionary pairs
 *   465.2.c.10       a unit that cannot be dealt damage is exempt from mandatory assignment
 *   465.3            skip FEPR — no priority between damage being dealt and the Resolution Step
 *   466.1.a.1/.a.2   Combat Cleanup heals; attackers are recalled if defenders remain
 *   466.3.a/.b/.d    combat result; 466.5/.a/466.5.b establish control / Uncontrolled
 *   469.1            no Conquer when the winner already controlled the battlefield
 *   815.1.b/.c.2     Tank: lethal before any same-controller non-Tank
 *   826.3/826.4.b    Backline: lethal only after every same-controller non-Backline unit
 */

import { describe, expect, test } from "bun:test";
import type { Decision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

// ---------------------------------------------------------------------------
// Inline filler definitions
// ---------------------------------------------------------------------------

/** [Action] "Deal N to a unit." */
const PING = (n: number) => ({
  abilities: [{ effect: { amount: n, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: `Filler Ping ${n}`,
  timing: "action",
});

/** [Action] "Give a unit ∓N Might this turn." */
const mightSpell = (name: string, n: number) => ({
  abilities: [
    { effect: { amount: n, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name,
  timing: "action",
});
const WITHER = (n: number) => mightSpell(`Filler Wither ${n}`, -n);
const GROW = (n: number) => mightSpell(`Filler Grow ${n}`, n);

/** [Reaction] "Kill a unit." (used to empty one side during a showdown) */
const REAP = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  keywords: ["Reaction"],
  name: "Filler Reap",
  timing: "reaction",
};

/** Unit: "I don't take damage." */
const UNTOUCHABLE = (might: number, keywords: string[] = []) => ({
  abilities: [{ effect: { restriction: "no-damage", type: "restriction" }, type: "static" }],
  keywords,
  might,
  name: `Filler Untouchable ${might}${keywords.length > 0 ? ` (${keywords.join("+")})` : ""}`,
});

/** Unit: "Other units you control here don't take damage." */
const DENIER = (might: number) => ({
  abilities: [
    {
      effect: { restriction: "no-damage", type: "restriction" },
      target: { controller: "friendly", excludeSelf: true, location: "here", type: "unit" },
      type: "static",
    },
  ],
  might,
  name: `Filler Denier ${might} (other friendly units here don't take damage)`,
});

/** Unit: "When I attack, draw 1." / "When I defend, draw 1." */
const ON_ATTACK_DRAW = (might: number) => ({
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "attack", on: "self" }, type: "triggered" }],
  might,
  name: `Filler Attack Trigger ${might}`,
});
const ON_DEFEND_DRAW = (might: number) => ({
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "defend", on: "self" }, type: "triggered" }],
  might,
  name: `Filler Defend Trigger ${might}`,
});

/** Meta bags (same mechanism-level installs the damage choke-point tests use). */
const DOUBLE = { grantedKeywords: [{ duration: "turn", keyword: "DoubleIncomingDamage" }] };
const GRANT_TANK = { grantedKeywords: [{ duration: "turn", keyword: "Tank" }] };

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

function showdownOf(game: G) {
  const stack = game.gameState.interaction?.showdownStack ?? [];
  const top = stack[stack.length - 1];
  return top?.active ? top : undefined;
}

function turnStateOf(game: G): "neutral-open" | "neutral-closed" | "showdown-open" | "showdown-closed" {
  const sd = showdownOf(game) !== undefined;
  const chain = game.gameState.interaction?.chain?.active ?? false;
  return sd ? (chain ? "showdown-closed" : "showdown-open") : chain ? "neutral-closed" : "neutral-open";
}

function isDistribute(d: Decision | null): d is Extract<Decision, { kind: "distribute" }> {
  return !!d && d.kind === "distribute";
}

function bucketLethals(d: Extract<Decision, { kind: "distribute" }>): Record<string, number | undefined> {
  return Object.fromEntries(d.buckets.map((b) => [b.card ?? b.key, b.lethal]));
}

/** Attacker and defender both pass Focus → the Combat Showdown closes (347.2.a / 348). */
async function passBoth(game: G): Promise<void> {
  await game.p1.passFocus();
  await game.p2.passFocus();
}

// ===========================================================================
// 1. Staging & opening the combat
// ===========================================================================

describe("144.2 / 446.3 / 450 / 453 / 323.8-323.13: the Standard Move exhausts, contests and STAGES a showdown + combat", () => {
  test("moving into an enemy-controlled battlefield exhausts the mover, applies Contested and opens a Combat Showdown — no damage yet, no control change, nothing on the chain", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender" }, "D")
      .unit(P1, "base", { might: 3, name: "Attacker" }, "A")
      .build();
    expect(turnStateOf(game)).toBe("neutral-open");

    await game.p1.move("A", "bf1");

    // 144.2 / 144.4.a: exhausting the mover is the cost of the Standard Move.
    expect(game.state("A").isExhausted).toBe(true);
    // 446.3: instantaneous — A is AT bf1, never in between.
    expect(game.locationOf("A")).toBe("bf1");
    // 190.3.a.1 / 450: Contested, applied by P1 (who does not control bf1).
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.gameState.battlefields.bf1?.contestedBy).toBe(P1);
    // 453 / 323.8 / 323.9 / 323.12 / 323.13 / 461.3: the cleanup staged and began a Combat Showdown.
    const sd = showdownOf(game);
    expect(sd?.battlefieldId).toBe("bf1");
    expect(sd?.isCombatShowdown).toBe(true);
    expect(turnStateOf(game)).toBe("showdown-open");

    // Must NOT happen: damage, control change, an exhausted defender, or a chain item for the move (446.3.c).
    expect(game.state("D").damage).toBe(0);
    expect(game.state("A").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // 190.4.b
    expect(game.state("D").isExhausted).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("464.2: the combat opens with P1 (who applied Contested) as Attacker, designations stamped only at bf1, Focus to the attacker and NO combat chain", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender" }, "D")
      .unit(P2, "bf2", { might: 2, name: "Elsewhere P2" }, "far2")
      .unit(P1, "bf2", { might: 2, name: "Elsewhere P1" }, "far1")
      .unit(P1, "base", { might: 3, name: "Attacker" }, "A")
      .build();

    await game.p1.move("A", "bf1");
    const sd = showdownOf(game);

    // 464.2.c.1 / .c.2: the player whose unit applied Contested attacks.
    expect(sd?.attackingPlayer).toBe(P1);
    expect(sd?.defendingPlayer).toBe(P2);
    // 464.2.c.3: every unit of each player AT bf1 is designated.
    expect(game.state("A").combatRole).toBe("attacker");
    expect(game.state("D").combatRole).toBe("defender");
    // 323.2.c: units elsewhere carry no designation.
    expect(game.state("far1").combatRole).toBeNull();
    expect(game.state("far2").combatRole).toBeNull();
    // 464.2.c.1.a / 464.2.d / 345: the attacker gains Focus.
    expect(sd?.focusPlayer).toBe(P1);
    expect(game.actingSeat()).toBe(P1);
    // 464.2.f.1: with no triggers, no Combat Chain is created — the state stays Showdown Open.
    expect(game.chain()).toEqual([]);
    expect(turnStateOf(game)).toBe("showdown-open");
    // Nothing has been summed or assigned yet.
    expect(game.state("D").damage).toBe(0);
  });
});

// ===========================================================================
// 2. Closing the showdown → summing Might → assigning
// ===========================================================================

describe("347.2.a / 348.1 / 465.2: on mutual pass the showdown closes and each side's CURRENT Might is summed", () => {
  test("A(3) vs D1(2)+D2(1): attacker's 3 is split 2/1 (both lethal), defenders' 3 kills A — all three die in the Combat Cleanup", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender 1" }, "D1")
      .unit(P2, "bf1", { might: 1, name: "Defender 2" }, "D2")
      .unit(P1, "base", { might: 3, name: "Attacker" }, "A")
      .build();

    await game.p1.move("A", "bf1");
    await passBoth(game);

    // 465.2.a/.b sum 3 vs 3, and 465.2.c.3 + 465.2.c.4 leave exactly ONE legal assignment
    // (2 to D1, 1 to D2), so no choice is offered — the attacker never gets to spread 3/0.
    expect(isDistribute(game.decision())).toBe(false);
    await game.settle();

    // 465.2.c.1.a / 323.5: everything is dealt simultaneously and everybody dies.
    expect(game.zoneOf("D1")).toBe("trash");
    expect(game.zoneOf("D2")).toBe("trash");
    expect(game.zoneOf("A")).toBe("trash");
    // 466.5.b: nobody remains → Uncontrolled, nobody scores.
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("465.2.c.1.a / 465.3: a doomed defender still deals its FULL Might and no player gets priority between damage and the deaths", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Defender" }, "D")
      .unit(P1, "base", { might: 3, name: "Attacker" }, "A")
      .build();

    await game.p1.move("A", "bf1");
    // Two passes are the whole input: no decision may be offered inside the damage step (465.3).
    await passBoth(game);

    expect(game.zoneOf("A")).toBe("trash");
    expect(game.zoneOf("D")).toBe("trash");
    // Whatever is being asked now is an ordinary main-phase action, not a showdown/priority window.
    const after = game.decision();
    if (after?.kind === "action") {
      expect(after.context).toBe("main");
    }
    expect(turnStateOf(game)).toBe("neutral-open");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.violations()).toEqual([]);
  });
});

// ===========================================================================
// 3. Lethal-first and no-overkill
// ===========================================================================

describe("465.2.c.3 / 465.2.c.4: lethal in full to one unit before the next; no overkill while units remain", () => {
  test("5 into three undamaged 3-Might defenders: only 3+2 is legal — exactly one dies, one keeps 2 (healed), one is untouched", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Defender 1" }, "D1")
      .unit(P2, "bf1", { might: 3, name: "Defender 2" }, "D2")
      .unit(P2, "bf1", { might: 3, name: "Defender 3" }, "D3")
      .unit(P1, "base", { might: 5, name: "Attacker" }, "A")
      .build();

    await game.p1.move("A", "bf1");
    await passBoth(game);
    const d = game.decision();
    expect(isDistribute(d)).toBe(true);

    // Chip spreads are all illegal (465.2.c.3).
    expect((await game.p1.try((p) => p.distribute({ D1: 2, D2: 1, D3: 2 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.distribute({ D1: 1, D2: 1, D3: 3 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.distribute({ D1: 2, D2: 2, D3: 1 }))).ok).toBe(false);
    await game.p1.distribute({ D1: 3, D2: 2 });
    await game.settle();

    expect(game.zoneOf("D1")).toBe("trash");
    // 466.1.a.1: the survivors are healed by the Combat Cleanup.
    expect(game.zoneOf("D2")).toBe("battlefield-bf1");
    expect(game.state("D2").damage).toBe(0);
    expect(game.zoneOf("D3")).toBe("battlefield-bf1");
    expect(game.state("D3").damage).toBe(0);
    // Defenders summed 9 → A dies; 466.5: P2 keeps bf1, no conquer (469.1).
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(0);
  });

  test("465.2.c.4 case A: pre-marked damage lowers lethal to 2, so 5 must go 2/2/1 and 3-on-one is illegal", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Defender 1" }, "D1", { damage: 1 })
      .unit(P2, "bf1", { might: 3, name: "Defender 2" }, "D2", { damage: 1 })
      .unit(P2, "bf1", { might: 3, name: "Defender 3" }, "D3", { damage: 1 })
      .unit(P2, "bf1", { might: 3, name: "Defender 4" }, "D4", { damage: 1 })
      .unit(P1, "base", { might: 5, name: "Attacker" }, "A")
      .build();

    await game.p1.move("A", "bf1");
    await passBoth(game);
    const d = game.decision();
    expect(isDistribute(d)).toBe(true);
    if (isDistribute(d)) {
      expect(bucketLethals(d)).toEqual({ D1: 2, D2: 2, D3: 2, D4: 2 });
    }
    // 465.2.c.4: more than the minimum lethal is illegal while further units remain.
    expect((await game.p1.try((p) => p.distribute({ D1: 3, D2: 2 }))).ok).toBe(false);
    await game.p1.distribute({ D1: 2, D2: 2, D3: 1 });
    await game.settle();

    expect(game.zoneOf("D1")).toBe("trash");
    expect(game.zoneOf("D2")).toBe("trash");
    expect(game.zoneOf("D3")).toBe("battlefield-bf1");
    expect(game.state("D3").damage).toBe(0); // 466.1.a.1 heals the old point too
    expect(game.zoneOf("D4")).toBe("battlefield-bf1");
  });

  test("465.2.c.4 case B: with only one defender left to receive damage, all 10 pile onto it — no carry-over anywhere", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Defender" }, "D")
      .unit(P1, "base", { might: 10, name: "Attacker" }, "A")
      .build();

    await game.p1.move("A", "bf1");
    await passBoth(game);
    await game.settle();

    expect(game.zoneOf("D")).toBe("trash");
    // Excess never leaves the unit: no damage on the battlefield's new occupant, no points from "trample".
    expect(game.zoneOf("A")).toBe("battlefield-bf1");
    expect(game.state("A").damage).toBe(0);
    expect(game.p1.points()).toBe(1); // 466.5.d — a Conquer, not an over-damage bonus
    expect(game.p2.points()).toBe(0);
  });

  test("143.3.b / 142.4.b: damage marked earlier this turn survives into combat and lets a 1-Might attacker kill a 3-Might defender", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Defender" }, "D")
      .unit(P1, "base", { might: 1, name: "Attacker" }, "A")
      .hand(P1, PING(2), "ping")
      .build();

    await game.p1.cast("ping", { targets: "D" });
    await game.settle();
    // 143.3.b: no cleanup, phase change or chain resolution heals it.
    expect(game.state("D").damage).toBe(2);
    expect(game.zoneOf("D")).toBe("battlefield-bf1");

    await game.p1.move("A", "bf1");
    await passBoth(game);
    await game.settle();

    // 142.4.b / 465.2.c.4: minimum lethal is 1, so the 1-Might attacker's whole assignment is lethal.
    expect(game.zoneOf("D")).toBe("trash");
    // …and D's 3 still kills A (Might is never reduced by damage).
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });
});

// ===========================================================================
// 4. Tank / Backline ordering
// ===========================================================================

describe("465.2.c.6 / 465.2.c.7 / 815 / 826: Tank first, Backline last, plain units in between", () => {
  function tankBoard(attackerMight: number, plainMight: number, backlineMight: number) {
    return scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { keywords: ["Tank"], might: 2, name: "Tank" }, "T")
      .unit(P2, "bf1", { might: plainMight, name: "Plain" }, "N")
      .unit(P2, "bf1", { keywords: ["Backline"], might: backlineMight, name: "Backline" }, "B")
      .unit(P1, "base", { might: attackerMight, name: "Attacker" }, "A");
  }

  test("case A — 4 into Tank(2)/plain(2)/Backline(2): the Tank and the plain unit die and the Backline unit is never touched", async () => {
    const game = await tankBoard(4, 2, 2).build();
    await game.p1.move("A", "bf1");
    await passBoth(game);
    // 815.1.b + 826.3 leave exactly one legal assignment (T then N), so nothing is asked.
    expect(isDistribute(game.decision())).toBe(false);
    await game.settle();

    expect(game.zoneOf("T")).toBe("trash"); // 815.1.c.2 — lethal to the Tank first
    expect(game.zoneOf("N")).toBe("trash");
    // 826.4.b: the Backline unit must be last, so it received nothing at all.
    expect(game.zoneOf("B")).toBe("battlefield-bf1");
    expect(game.state("B").damage).toBe(0);
  });

  test("case A' — with 3 to assign against Tank(2)/plain(1)/Backline(1) the leftover point kills the PLAIN unit, never the Backline one", async () => {
    const game = await tankBoard(3, 1, 1).build();
    await game.p1.move("A", "bf1");
    await passBoth(game);
    await game.settle();

    expect(game.zoneOf("T")).toBe("trash");
    expect(game.zoneOf("N")).toBe("trash");
    expect(game.zoneOf("B")).toBe("battlefield-bf1");
    expect(game.state("B").damage).toBe(0);
  });

  test("case B — two Tanks may be ordered freely between themselves (465.2.c.7), but the plain unit waits until both have lethal", async () => {
    /** Tank 2 Might + Tank 3 Might + plain 2 Might vs 4 attacking Might: two legal lines. */
    function twoTanks() {
      return scenario()
        .battlefield("bf1", { controller: P2 })
        .unit(P2, "bf1", { keywords: ["Tank"], might: 2, name: "Tank 1" }, "T1")
        .unit(P2, "bf1", { keywords: ["Tank"], might: 3, name: "Tank 2" }, "T2")
        .unit(P2, "bf1", { might: 2, name: "Plain" }, "N")
        .unit(P1, "base", { might: 4, name: "Attacker" }, "A");
    }
    async function opened() {
      const g = await twoTanks().build();
      await g.p1.move("A", "bf1");
      await passBoth(g);
      return g;
    }
    // The assigner picks WHICH Tank takes lethal first — a real Decision, both branches legal.
    const t1First = await opened();
    expect(t1First.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 4 });
    expect((await t1First.p1.try((p) => p.distribute({ T1: 2, T2: 2 }))).ok).toBe(true);
    const t2First = await opened();
    expect((await t2First.p1.try((p) => p.distribute({ T1: 1, T2: 3 }))).ok).toBe(true);

    // 815.1.c.2: the plain unit may not be assigned anything while either Tank lacks lethal.
    const game = await opened();
    expect((await game.p1.try((p) => p.distribute({ N: 2, T1: 2 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.distribute({ N: 2, T2: 2 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.distribute({ N: 4 }))).ok).toBe(false);
  });

  test("465.2.c.8 / 465.2.c.9: a unit with BOTH Tank and Backline is assigned first OR last — the assigner picks which requirement to honour", async () => {
    /** Printed Backline, granted Tank this turn: two exclusionary requirements on one unit. */
    function dual() {
      return scenario()
        .battlefield("bf1", { controller: P2 })
        .unit(P2, "bf1", { keywords: ["Backline"], might: 2, name: "Dual" }, "C", GRANT_TANK)
        .unit(P2, "bf1", { might: 2, name: "Plain 1" }, "N1")
        .unit(P2, "bf1", { might: 2, name: "Plain 2" }, "N2")
        .unit(P1, "base", { might: 4, name: "Attacker" }, "A");
    }
    async function opened() {
      const g = await dual().build();
      await g.p1.move("A", "bf1");
      await passBoth(g);
      return g;
    }
    const tankLine = await opened();
    expect(tankLine.state("C").keywords).toContain("Tank");
    expect(tankLine.state("C").keywords).toContain("Backline");
    // The 4 points cannot cover all three, so the choice of requirement decides who dies.
    expect(tankLine.decision()).toMatchObject({ kind: "distribute", seat: P1 });
    // Honouring Tank: C first, then one plain unit.
    expect((await tankLine.p1.try((p) => p.distribute({ C: 2, N1: 2 }))).ok).toBe(true);

    // Honouring Backline instead: C last (nothing assigned to it), both plain units die.
    const backlineLine = await opened();
    expect((await backlineLine.p1.try((p) => p.distribute({ N1: 2, N2: 2 }))).ok).toBe(true);
    await backlineLine.settle();
    expect(backlineLine.zoneOf("N1")).toBe("trash");
    expect(backlineLine.zoneOf("N2")).toBe("trash");
    // Must NOT happen: the engine forcing Tank, or declaring "no legal assignment".
    expect(backlineLine.zoneOf("C")).toBe("battlefield-bf1");
    expect(backlineLine.violations()).toEqual([]);
  });
});

// ===========================================================================
// 5. Status: stun, negative Might, exhaustion
// ===========================================================================

describe("423.1.b / 423.1.c / 143.2.b: stunned and negative-Might units contribute 0 but are killed at full price", () => {
  test("a stunned 4-Might attacker adds 0 to the attackers' sum, yet the defender still needs 4 to kill it", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Defender" }, "D")
      .unit(P1, "base", { might: 4, name: "Stunned Attacker" }, "A1", { stunned: true })
      .unit(P1, "base", { might: 2, name: "Attacker 2" }, "A2")
      .build();

    await game.p1.move(["A1", "A2"], "bf1");
    await passBoth(game);

    // 465.2.b: the DEFENDER assigns its 3 among the attackers; 423.1.c — the stunned A1 is still
    // lethal only at its full 4 Might, so 3 can never kill it.
    const d = game.decision();
    expect(isDistribute(d)).toBe(true);
    if (isDistribute(d)) {
      expect(d.seat).toBe(P2);
      expect(d.total).toBe(3);
      expect(bucketLethals(d)).toEqual({ A1: 4, A2: 2 });
    }
    await game.p2.distribute({ A1: 1, A2: 2 });
    await game.settle();

    // 423.1.b: attackers summed 2 (A1 contributed 0) → the 3-Might defender survives.
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    expect(game.state("D").damage).toBe(0);
    expect(game.zoneOf("A2")).toBe("trash");
    // 423.1.b never removes the unit from the combat: A1 survived 1 damage and was recalled (466.1.a.2).
    expect(game.zoneOf("A1")).toBe("base");
    expect(game.state("A1").isStunned).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("143.2.b / 143.2.b.1: a defender pushed to −2 Might contributes 0, dies to a single assigned point, and a later +3 works off the REAL −2", async () => {
    const arith = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Defender" }, "D")
      .hand(P1, WITHER(5), "wither")
      .hand(P1, GROW(3), "grow")
      .build();
    await arith.p1.cast("wither", { targets: "D" });
    await arith.settle();
    // The effective value is treated as 0 (143.2.b) while the real modifier stays −5.
    expect(arith.state("D").might).toBe(0);
    expect(arith.state("D").mightModifier).toBe(-5);
    await arith.p1.cast("grow", { targets: "D" });
    await arith.settle();
    // 143.2.b.1: +3 operates on −2, giving 1 — not on the treated-as-0 value (which would give 3).
    expect(arith.state("D").might).toBe(1);

    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Defender" }, "D")
      .unit(P1, "base", { might: 1, name: "Attacker" }, "A")
      .hand(P1, WITHER(5), "wither")
      .build();

    await game.p1.cast("wither", { targets: "D" });
    await game.settle();
    expect(game.state("D").might).toBe(0);

    await game.p1.move("A", "bf1");
    await passBoth(game);
    await game.settle();

    // Defenders' sum is 0 → A takes nothing; the attacker's 1 is lethal against 0 (142.4.b).
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.zoneOf("A")).toBe("battlefield-bf1");
    expect(game.state("A").damage).toBe(0);
    expect(game.p1.points()).toBe(1);
  });

  test("465.2.b: EXHAUSTED defenders deal their full Might — readiness is never consulted in the damage step", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender 1" }, "D1", { exhausted: true })
      .unit(P2, "bf1", { might: 3, name: "Defender 2" }, "D2", { exhausted: true })
      .unit(P1, "base", { might: 4, name: "Attacker" }, "A")
      .build();
    expect(game.state("D1").isExhausted).toBe(true);
    expect(game.state("D2").isExhausted).toBe(true);
    expect(game.state("D1").isStunned).toBe(false); // exhausted ≠ stunned

    await game.p1.move("A", "bf1");
    await passBoth(game);
    // Attacker's 4: lethal 2 on D1, the remaining 2 onto D2 (non-lethal).
    await game.p1.distribute({ D1: 2, D2: 2 });
    await game.settle();

    // Defenders summed 5 (2 + 3, both exhausted) → A dies.
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.zoneOf("D1")).toBe("trash");
    expect(game.zoneOf("D2")).toBe("battlefield-bf1");
    expect(game.state("D2").damage).toBe(0);
    expect(game.state("D2").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});

// ===========================================================================
// 6. Units that cannot be dealt damage
// ===========================================================================

describe("465.2.c.10: a unit that cannot be dealt damage is exempt from every mandatory-assignment consideration", () => {
  test("an 'I don't take damage' TANK does not block assignment: the 2 goes to the plain unit and kills it", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", UNTOUCHABLE(2, ["Tank"]), "X")
      .unit(P2, "bf1", { might: 2, name: "Plain" }, "N")
      .unit(P1, "base", { might: 2, name: "Attacker" }, "A")
      .build();

    await game.p1.move("A", "bf1");
    await passBoth(game);
    await game.settle();

    // No "no legal assignment" deadlock, and no damage was recorded on the untouchable Tank.
    expect(game.zoneOf("N")).toBe("trash");
    expect(game.zoneOf("X")).toBe("battlefield-bf1");
    expect(game.state("X").damage).toBe(0);
    // X's own 2 (plus N's 2) killed the attacker.
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  // BUG: an inline static "other units you control here don't take damage" is not applied to the
  // other units at all — the engine assigns the attacker's 3 to a protected 2-Might unit and kills
  // it, instead of routing the only legal assignment onto the denier (465.2.c.10).
  test("465.2.c.10 — a denial that ends with its source: killing the denier must NOT retroactively damage the units it protected", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", DENIER(3), "S")
      .unit(P2, "bf1", { might: 2, name: "Protected 1" }, "P1u")
      .unit(P2, "bf1", { might: 2, name: "Protected 2" }, "P2u")
      .unit(P1, "base", { might: 3, name: "Attacker" }, "A")
      .build();

    await game.p1.move("A", "bf1");
    await passBoth(game);
    await game.settle();

    // 465.2.c.10: only S could legally receive damage; 3 is lethal on it.
    expect(game.zoneOf("S")).toBe("trash");
    // Damage does not flow back once the denier is gone (465.2.c.1.a — one simultaneous deal).
    expect(game.zoneOf("P1u")).toBe("battlefield-bf1");
    expect(game.state("P1u").damage).toBe(0);
    expect(game.zoneOf("P2u")).toBe("battlefield-bf1");
    expect(game.state("P2u").damage).toBe(0);
    // rule 465.2.b: the protected units still COUNT their Might — the defenders
    // assign 3+2+2 to the lone 3-Might attacker, so it dies instead of being
    // recalled. P2 keeps bf1 either way (466.3.d).
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });
});

// ===========================================================================
// 7. The Combat Chain, and skipping the damage step
// ===========================================================================

describe("464.2.e / 337.1.b / 337.4 / 340.1 / 346.1: the attacker's trigger is appended first, so the DEFENDER's resolves first — and Focus does not pass", () => {
  test("both sides' designation triggers go on one Combat Chain; the defender's resolves first and Focus stays with the attacker", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", ON_DEFEND_DRAW(2), "D")
      .unit(P1, "base", ON_ATTACK_DRAW(3), "A")
      .build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;

    await game.p1.move("A", "bf1");

    // 464.2.e.1 / 337.1.b: the attacking player (who has Focus) appends first, the defender second.
    expect(game.chain().map((c) => c.cardId)).toEqual(["A", "D"]);
    expect(game.chain().every((c) => c.triggered)).toBe(true);
    // 464.2.f: a Combat Chain was created → the state Closes; damage waits.
    expect(turnStateOf(game)).toBe("showdown-closed");
    expect(game.state("A").damage).toBe(0);
    expect(game.state("D").damage).toBe(0);
    // 337.4: once nothing is left to finalize, the controller of the NEWEST item gains Priority.
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });

    // 340.1: the newest Finalized item resolves first → the DEFENDER's trigger, not the attacker's.
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["A"]);
    expect(game.p2.hand().length).toBe(p2Hand + 1);
    expect(game.p1.hand().length).toBe(p1Hand);
    // Still no damage while an item remains on the Combat Chain.
    expect(game.state("A").damage).toBe(0);

    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand().length).toBe(p1Hand + 1);
    // 346.1 / 340.2.a: the chain opened from triggered abilities, so Focus does NOT pass.
    expect(showdownOf(game)?.focusPlayer).toBe(P1);
    expect(turnStateOf(game)).toBe("showdown-open");
  });
});

describe("465.1 / 466: with one side emptied during the showdown there is NO damage step", () => {
  test("the lone attacker is killed in the showdown: nothing is summed, the defender wins, keeps bf1 with no Conquer, and Contested is cleared", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender" }, "D")
      .unit(P1, "base", { might: 5, name: "Attacker" }, "A")
      .hand(P2, REAP, "reap")
      .build();

    await game.p1.move("A", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("reap", { targets: "A" });
    await game.settle();

    // 465.1: both sides must still have units there — they do not, so no damage is dealt.
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    expect(game.state("D").damage).toBe(0);
    // 466.3.a/.b + 466.5: the defender wins; it already controlled bf1 → no Conquer, no point (469.1).
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(0);
    // 466.5.a: the combat ends cleanly — Contested is cleared, designations gone.
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.state("D").combatRole).toBeNull();
    expect(turnStateOf(game)).toBe("neutral-open");
  });
});

// ===========================================================================
// 8. Replacements apply to the assignment
// ===========================================================================

describe("465.2.c.5 / 465.2.c.4.a: a doubling replacement applies at ASSIGNMENT — the assigner picks the minimum applied lethal value", () => {
  test("attacker 5 into a doubled 3-Might defender plus two plain ones: 2 raw (→4 applied) is the lethal choice; 3 raw is over-assignment", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Doubled Defender" }, "D", DOUBLE)
      .unit(P2, "bf1", { might: 3, name: "Plain Defender 2" }, "D2")
      .unit(P2, "bf1", { might: 3, name: "Plain Defender 3" }, "D3")
      .unit(P1, "base", { might: 5, name: "Attacker" }, "A")
      .build();

    await game.p1.move("A", "bf1");
    await passBoth(game);
    const d = game.decision();
    expect(isDistribute(d)).toBe(true);
    if (isDistribute(d)) {
      // 465.2.c.4.a: the prompt's lethal for D reflects the doubling (2 raw doubles to 4 ≥ 3).
      expect(bucketLethals(d)).toEqual({ D: 2, D2: 3, D3: 3 });
    }
    // 465.2.c.4: 3 raw would double to 6 — more than the minimum lethal while other units remain.
    expect((await game.p1.try((p) => p.distribute({ D: 3, D2: 2 }))).ok).toBe(false);
    await game.p1.distribute({ D: 2, D2: 3 });
    await game.settle();

    // Both die; the doubling is not applied a second time when the damage is dealt (465.2.c.5).
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.zoneOf("D2")).toBe("trash");
    expect(game.zoneOf("D3")).toBe("battlefield-bf1");
    expect(game.state("D3").damage).toBe(0);
    // Defenders' 9 killed the attacker; P2 keeps bf1 and scores nothing (469.1).
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(0);
  });
});
