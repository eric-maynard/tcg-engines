/**
 * Interaction: Leona, Zealot (ogn-079-298) × Forbidding Waste (unl-210-219) × Zenith Blade (ogn-262-298)
 *              (+ Fiora, Victorious ogn-232-298 as the lone defender, Discipline ogn-058-298 as P2's answer)
 *
 *   Leona, Zealot — Champion Unit · Calm · 6 + [calm] · 6 Might
 *     "… Stunned enemy units here have -8 [Might], to a minimum of 1 [Might]."          — P1's, ready in base
 *   Forbidding Waste — Battlefield
 *     "While a unit here is defending alone, it has -2 [Might]."                         — controlled by P2, Fiora alone on it
 *   Zenith Blade — Spell · Calm/Order · 3 + 2 power · [Action]
 *     "Stun an enemy unit at a battlefield. You may move a friendly unit to that enemy unit's battlefield." — P1's hand
 *   Fiora, Victorious — Champion Unit · Order · 4 Might, "While I'm [Mighty], I have [Deflect], [Ganking], and [Shield]."
 *   Discipline — Spell · Calm · 2 · [Reaction] "Give a unit +2 [Might] this turn. Draw 1."      — P2's hand
 *
 * Rules: 477.3.e.1 / .e.2 (increases first, decreases last), 477.3.b (a limitation from a PASSIVE ability
 * is not snapshotted — re-evaluated on every pass), 478 / 478.1.c (same layer+sublayer, applying one alters
 * the outcome of the other → Dependency), 479 / 479.2 (the effect whose evaluation is altered Depends on the
 * other; apply the depended-on first, the dependent immediately after), 480 (timestamps only when NO
 * dependency), 143.2.a (nonzero damage ≥ Might kills), 143.2.b (Might < 0 is treated as 0), 423.1.b (a
 * stunned unit deals no combat damage).
 *
 * Question: P1 plays Zenith Blade: stun Fiora, move Leona onto the Waste → combat; Fiora defends alone AND is
 * stunned at Leona's battlefield.
 *   (a) Waste -2 (no floor) and Leona -8 (floor 1) are both layer-3 decreases. Order? Might 1 or -1/0?
 *   (b) P2 (Focus) Disciplines Fiora (+2). Might?
 *   (c) Why doesn't Leona's "-8 min 1" snapshot?
 *   (d) How much kills Fiora; does she deal any damage?
 *
 * Expected: (a) only Leona's limited effect is altered by the sequence → Leona Depends on Waste → Waste
 * first (4→2), Leona immediately after (→1). Fiora is 1 — decided by dependency, not timestamp. (b) +2 is
 * an increase, applied before both: 6 → 4 → 1. Still 1. (c) both are passives → no snapshot; the floor is
 * re-applied on every evaluation, which is exactly why the +2 is absorbed. (d) she contributes 0 (stunned);
 * any 1+ is lethal; Leona's 6 kills her and Leona conquers the Waste. With a second defender the Waste is
 * off and she is simply max(1, 4-8) = 1. If Leona never comes "here", neither passive touches her: 4 while
 * stunned, 6 with Discipline, and the stun lapses at end of turn.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LEONA_ZEALOT = "ogn-079-298";
const FORBIDDING_WASTE = "unl-210-219";
const ZENITH_BLADE = "ogn-262-298";
const FIORA_VICTORIOUS = "ogn-232-298";
const DISCIPLINE = "ogn-058-298";

/**
 * P1's turn (turn 2, main). Forbidding Waste ("waste", live abilities) is P2's, with Fiora, Victorious
 * (4, unbuffed) alone on it — or with a vanilla 1-Might Squire beside her for the not-alone control.
 * P1: Leona, Zealot ready in base; Zenith Blade in hand with exactly 3 + [calm] + [order].
 * P2: Discipline in hand with exactly 2 energy. Scores 0–0 (Leona's "enter ready" line is irrelevant: she
 * starts on the board).
 */
function board(opts: { squire?: boolean } = {}) {
  const b = scenario()
    .resources(P1, { energy: 3, power: { calm: 1, order: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("waste", { controller: P2, def: FORBIDDING_WASTE, inert: false, owner: P2 })
    .unit(P2, "waste", FIORA_VICTORIOUS, "fiora")
    .unit(P1, "base", LEONA_ZEALOT, "leona")
    .hand(P1, ZENITH_BLADE, "zenith")
    .hand(P2, DISCIPLINE, "discipline");
  if (opts.squire) {
    b.unit(P2, "waste", { might: 1, name: "Squire" }, "squire");
  }
  return b;
}

/** P1 casts Zenith Blade (stun Fiora / mover Leona); both pass; on resolution P1 takes (or declines) the move onto the Waste. */
async function zenithBlade(opts: { squire?: boolean; move?: boolean } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.cast("zenith", { targets: ["fiora", "leona"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, order: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.state("fiora").isStunned).toBe(true);
  // "You MAY move a friendly unit to that enemy unit's battlefield" — asked as Leona's destination (declinable).
  expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "destination" });
  if (opts.move === false) {
    await game.p1.decline();
  } else {
    await game.p1.pick("battlefield-waste");
  }
  return game;
}

/** From the open combat: P1 passes Focus, P2 (Focus) Disciplines Fiora, P2 + P1 pass priority → it resolves. Showdown still open. */
async function disciplined(game: Game): Promise<void> {
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "discipline")).toBe(true);
  await game.p2.cast("discipline", { targets: "fiora" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("discipline")).toBe("trash");
}

function combatDamageTo(game: Game, target: string): number {
  return (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === target).reduce((s, r) => s + r.amount, 0);
}

describe("setup — Zenith Blade stuns Fiora and walks Leona onto Forbidding Waste: a combat where Fiora defends alone, stunned, at Leona's battlefield", () => {
  test("after the spell: Fiora stunned at the Waste, Leona at the Waste as the attacker, Fiora the lone defender; P1 (attacker) holds Focus", async () => {
    const game = await zenithBlade();
    expect(game.zoneOf("zenith")).toBe("trash");
    expect(game.state("leona")).toMatchObject({ combatRole: "attacker", might: 6, zone: "battlefield-waste" });
    expect(game.state("fiora")).toMatchObject({ combatRole: "defender", isStunned: true, zone: "battlefield-waste" });
    expect(game.p2.units("waste")).toEqual(["fiora"]); // alone
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });
});

describe("(a) two passive layer-3 decreases on Fiora: Waste -2 (unlimited) and Leona -8 (floor 1) — dependency, not timestamp", () => {
  // Expected: Leona's floor-limited effect is the one whose result changes with the order, so it Depends on
  // the Waste's (478.1.c/479); apply Waste first 4→2, then Leona 2→1 (479.2). Fiora's Might is exactly 1.
  // Actual: the engine applies Leona's -8-min-1 first (4→1) and the Waste's -2 afterwards (→ -1, shown as
  // 0 per 143.2.b): staticMightBonus -5, effective Might 0.
  test("Fiora's Might is 1 — Waste applied first, Leona's floored decrease immediately after (478.1.c, 479, 479.2; not -1/0)", async () => {
    const game = await zenithBlade();
    expect(game.state("fiora").baseMight).toBe(4);
    expect(game.state("fiora").might).toBe(1);
  });

  test("whatever the order, she is never shown below 0 (143.2.b) and never keeps her printed 4: both passives are demonstrably applying (net static penalty ≤ -3)", async () => {
    const game = await zenithBlade();
    const s = game.state("fiora");
    expect(s.might).toBeGreaterThanOrEqual(0);
    expect(s.might).toBeLessThanOrEqual(1);
    expect(s.staticMightBonus).toBeLessThanOrEqual(-3);
    expect(s.mightModifier).toBe(0); // no resolved +/-N 'this turn' effects involved — pure passives
  });

  test("control — NOT alone (a Squire also defends): the Waste is silent, no dependency question; Fiora is simply max(1, 4 - 8) = 1 and the unstunned 1-Might Squire is untouched", async () => {
    const game = await zenithBlade({ squire: true });
    expect(game.p2.units("waste").sort()).toEqual(["fiora", "squire"]);
    expect(game.state("fiora")).toMatchObject({ baseMight: 4, isStunned: true, might: 1, staticMightBonus: -3 });
    expect(game.state("squire")).toMatchObject({ isStunned: false, might: 1 });
  });
});

describe("(b) P2 Disciplines the stunned, lone Fiora (+2 this turn): the increase goes in first and is completely absorbed", () => {
  test("P2 needs Focus for nothing here — Discipline is a Reaction — but gets it anyway once P1 passes; it resolves and its +2 is tracked on Fiora (mightModifier 2), P2 draws 1", async () => {
    const game = await zenithBlade();
    const hand = game.p2.hand().length;
    await disciplined(game);
    expect(game.state("fiora").mightModifier).toBe(2);
    expect(game.p2.hand()).toHaveLength(hand - 1 + 1);
    expect(game.p2.energy()).toBe(0);
  });

  // Expected: 4 + 2 = 6 (increase first, 477.3.e.1) → Waste 6→4 → Leona 4→1 (floor re-evaluated, 477.3.b):
  // still exactly 1. Actual: same mis-ordering as (a): 6 → Leona → 1 → Waste → -1, shown as 0.
  test("after Discipline Fiora is STILL 1 — not 3, and not 0 (477.3.e.1 then Waste, then Leona's non-snapshotted floor; 477.3.b, 479.2)", async () => {
    const game = await zenithBlade();
    await disciplined(game);
    expect(game.state("fiora")).toMatchObject({ baseMight: 4, mightModifier: 2 });
    expect(game.state("fiora").might).toBe(1);
  });

  test("(c) no snapshot: the +2 did not lift her to 3 — Leona's passive floor is re-applied over the new total, so her shown Might did not rise at all (≤ 1 before, ≤ 1 after)", async () => {
    const game = await zenithBlade();
    const before = game.state("fiora").might;
    await disciplined(game);
    const after = game.state("fiora").might;
    expect(before).toBeLessThanOrEqual(1);
    expect(after).toBeLessThanOrEqual(1);
    expect(after).not.toBe(3);
    expect(after).toBe(before);
  });

  // Expected: 4 + 2 = 6 (and even +1 more if Fiora's "while Mighty → [Shield]" is counted: every increase is
  // applied BEFORE the decreases, 477.3.e.1) → Leona's -8 floored at 1 → exactly 1 under any ordering of the
  // increases. Actual: the engine floors to 1 first and then adds Fiora's Shield +1 on top (she briefly read
  // as Mighty at 6) → Might 2, i.e. an increase applied after a decrease.
  test("control — not alone + Discipline: 4 + 2 (+ any Shield) → Leona's floor → exactly 1; the Squire beside her makes no difference (477.3.e.1/.e.2)", async () => {
    const game = await zenithBlade({ squire: true });
    await disciplined(game);
    expect(game.state("fiora").mightModifier).toBe(2);
    expect(game.state("fiora").might).toBe(1);
  });
});

describe("(d) combat: stunned Fiora deals nothing; 1+ is lethal; Leona kills her and conquers the Waste", () => {
  test("both pass Focus → damage step: P2 is never asked to assign (Fiora contributes 0, 423.1.b); Leona's 6 all land on Fiora; Leona takes 0", async () => {
    const game = await zenithBlade();
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d) {
        break;
      }
      seen.push(`${d.seat}:${d.kind}`);
      if (d.kind === "distribute" && d.seat === P1) {
        expect(d.total).toBe(6);
        expect(d.buckets.map((b) => [b.card ?? b.key, b.lethal])).toEqual([["fiora", 1]]);
        await game.p1.distribute({ [d.buckets[0]?.key as string]: 6 });
        continue;
      }
      if (d.kind !== "action" || d.context === "main" || !d.passKey) {
        break;
      }
      await game.acting().pass();
    }
    expect(seen).not.toContain(`${P2}:distribute`);
    await game.settle();
    expect(combatDamageTo(game, "fiora")).toBe(6);
    expect(combatDamageTo(game, "leona")).toBe(0);
  });

  test("outcome: Fiora → P2's trash (a fresh 4-Might card there, stun and modifiers gone — 124); Leona undamaged on the Waste; P1 conquers it and scores 1", async () => {
    const game = await zenithBlade();
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("fiora")).toBe("trash");
    expect(game.p2.trash()).toContain("fiora");
    expect(game.state("fiora")).toMatchObject({ isStunned: false, might: 4, mightModifier: 0, staticMightBonus: 0 });
    expect(game.state("leona")).toMatchObject({ combatRole: null, damage: 0, might: 6, zone: "battlefield-waste" });
    expect(game.gameState.battlefields.waste).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Discipline does not save her: +2 absorbed, still lethal at 1 — she dies all the same and P1 conquers (P2 is just down a card's worth of energy, up one draw)", async () => {
    const game = await zenithBlade();
    await disciplined(game);
    await game.settle();
    expect(game.zoneOf("fiora")).toBe("trash");
    expect(game.gameState.battlefields.waste?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("control — with the Squire: defenders sum 1 (Squire only; stunned Fiora adds 0) onto Leona; P1 splits 6 with lethal thresholds Fiora 1 / Squire 1; both die, Leona (1 damage, healed after) conquers", async () => {
    const game = await zenithBlade({ squire: true });
    let assigned = false;
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d) {
        break;
      }
      if (d.kind === "distribute" && d.seat === P1) {
        expect(d.total).toBe(6);
        expect(Object.fromEntries(d.buckets.map((b) => [b.card ?? b.key, b.lethal]))).toEqual({ fiora: 1, squire: 1 });
        const key = (c: string) => d.buckets.find((b) => (b.card ?? b.key) === c)?.key as string;
        await game.p1.distribute({ [key("fiora")]: 5, [key("squire")]: 1 });
        assigned = true;
        continue;
      }
      if (d.kind !== "action" || d.context === "main" || !d.passKey) {
        break;
      }
      await game.acting().pass();
    }
    await game.settle();
    if (assigned) {
      expect(combatDamageTo(game, "fiora")).toBe(5);
      expect(combatDamageTo(game, "squire")).toBe(1);
    }
    expect(combatDamageTo(game, "leona")).toBe(1);
    expect(game.zoneOf("fiora")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.state("leona")).toMatchObject({ damage: 0, zone: "battlefield-waste" });
    expect(game.gameState.battlefields.waste?.controller).toBe(P1);
  });
});

describe("contrast — Leona never comes 'here': neither passive applies outside 'defending alone at Leona's battlefield'", () => {
  test("P1 declines Zenith Blade's optional move: Fiora is stunned but NOT in combat and Leona is in base → printed 4 (Waste needs 'defending', Leona needs 'here')", async () => {
    const game = await zenithBlade({ move: false });
    await game.settle();
    expect(game.locationOf("leona")).toBe("base");
    expect(game.state("fiora")).toMatchObject({ combatRole: null, isStunned: true, might: 4, staticMightBonus: 0 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("…the stun lapses at end of turn (printed 4, un-stunned on P2's turn), and there the same Discipline DOES raise her: 4 + 2 = 6 — nothing 'here' to absorb it", async () => {
    const game = await zenithBlade({ move: false });
    await game.settle();
    await game.advanceTurn(); // → P2's turn: the 'this turn' stun ended in P1's Expiration Step
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("fiora")).toMatchObject({ isStunned: false, might: 4 });
    if (game.p2.energy() < 2) {
      await game.p2.tapRunes(2 - game.p2.energy());
    }
    await game.p2.cast("discipline", { targets: "fiora" });
    await game.settle();
    expect(game.state("fiora")).toMatchObject({ might: 6, mightModifier: 2 });
  });
});
