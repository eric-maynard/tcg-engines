/**
 * Interaction: Leona, Zealot (ogn-079-298) · Champion Unit · Calm · 6 + [calm] · 6 Might
 *     "If an opponent's score is within 3 points of the Victory Score, I enter ready.
 *      Stunned enemy units here have -8 [Might], to a minimum of 1 [Might]."          — P2's, at bf1
 *   × Rune Prison (ogn-050-298) · Spell · Calm · 2 + [calm] · [Action]
 *     "Stun a unit. (It doesn't deal combat damage this turn.)"                        — in P2's hand
 *   × a vanilla 8-Might attacker (P1)                                                  — the lone attacker
 *   (+ Glorious Executioner sfd-185-221 "When you win a combat, draw 1." as P2's legend — an OBSERVATION
 *    PROBE only: P2's hand grows by one exactly when P2 is the combat's winner, 466.3.a.)
 *
 * Question. P1's turn; P2 controls bf1 with Leona and holds Rune Prison. P1 attacks alone with the
 * 8-Might unit. Combat opens, P1 (Focus) passes; P2 with Focus plays Rune Prison on the attacker; both
 * then pass.
 *   (a) Could P2 have cast Rune Prison while merely holding priority on a chain, or only with Focus?
 *   (b) Step 2: what does each side sum, is P1 given an assignment Decision at all, how much must P2
 *       assign to the stunned attacker to make it lethal — 8 (printed) or 1 (current Might under Leona)?
 *       Outcome and Step 3 result/control?
 *   (c) Contrast: the defender is a vanilla 6-Might unit instead of Leona — sums, lethal threshold, does
 *       the attacker die, is it recalled, is there a combat winner, does anyone conquer?
 *
 * Rules: 806.1 / 347.1 ([Action] = showdown-Open permission: needs Focus AND priority, not bare priority
 * on someone else's chain), 423.1.b (a stunned unit contributes no Might in the damage step), 423.1.c
 * (a stunned unit still needs damage ≥ its full — i.e. current — Might to die), 423.1.a.2 (stun lapses at
 * end of turn), 465.2.a–d (sums, assignment; 465.2.c.4: the last/lone enemy unit takes everything),
 * 466.1.a.1 (3c heal all), 466.1.a.2 (3d recall attackers if defenders remain), 466.3.a (only one
 * player's units remain → that player won), 466.3.d (units recalled in 3d → No Result), 466.5 (the
 * player with units remaining establishes control only if they didn't already control it).
 *
 * Expected: (a) only with Focus. (b) attacker is stunned AND at Leona's battlefield → Might 1; attackers
 * sum 0 (no assignment for P1, Leona takes 0), defenders sum 6 → all 6 to the lone attacker, 6 ≥ 1 →
 * it dies in the Combat Cleanup; only P2's units remain → P2 won (probe draws 1); P2 already controls
 * bf1 → no conquer, no points; Contested cleared. (c) vanilla defender: attacker stays 8 while stunned;
 * 0 vs 6; 6 < 8 → survives, healed to 0, recalled to P1's base still stunned; No Result (probe draws
 * nothing); bf1 stays P2's, uncontested, no points; the stun drops at end of turn.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LEONA_ZEALOT = "ogn-079-298";
const RUNE_PRISON = "ogn-050-298";
const GLORIOUS_EXECUTIONER = "sfd-185-221"; // probe legend: "When you win a combat, draw 1."
const DISCIPLINE = "ogn-058-298"; // calm · 2 · [Reaction] "Give a unit +2 [Might] this turn. Draw 1." — only to open a chain in (a)

/**
 * P1's turn (turn 2, main). P2 controls bf1 with the defender (Leona, or a vanilla 6 "Wall"), holds Rune
 * Prison with exactly 2 energy + 1 calm to pay for it, and has the Glorious Executioner probe legend.
 * P1's vanilla 8-Might "Brute" waits in base.
 */
function board(opts: { defender?: "leona" | "vanilla"; p1Discipline?: boolean } = {}) {
  let b = scenario()
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .legend(P2, GLORIOUS_EXECUTIONER, "executioner")
    .unit(P1, "base", { might: 8, name: "Brute" }, "brute")
    .hand(P2, RUNE_PRISON, "prison");
  b = opts.defender === "vanilla" ? b.unit(P2, "bf1", { might: 6, name: "Wall" }, "wall") : b.unit(P2, "bf1", LEONA_ZEALOT, "leona");
  if (opts.p1Discipline) {
    b = b.resources(P1, { energy: 2 }).hand(P1, DISCIPLINE, "discipline");
  }
  return b;
}

function showdown(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1);
}

/** Combat damage records dealt to `target` (public damageLog). */
function combatDamageTo(game: Game, target: string): number {
  return (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === target).reduce((s, r) => s + r.amount, 0);
}

/** Brute attacks bf1; P1 passes Focus; P2 (Focus) casts Rune Prison on Brute; P2 pass, P1 pass → it resolves. */
async function stunnedAttacker(defender: "leona" | "vanilla"): Promise<Game> {
  const game = await board({ defender }).build();
  await game.p1.move("brute", "bf1");
  await game.p1.passFocus();
  await game.p2.cast("prison", { targets: "brute" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("prison")).toBe("trash");
  return game;
}

/**
 * From the stunned position: pass Focus for whoever holds it until something that is not a
 * showdown/chain pass appears (a distribute prompt, or the open main phase). Returns every decision seen.
 */
async function closeShowdownWatching(game: Game) {
  const seen: NonNullable<ReturnType<Game["decision"]>>[] = [];
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    seen.push(d);
    if (d.kind !== "action" || d.context === "main" || !d.passKey) {
      break;
    }
    await game.acting().pass();
  }
  return seen;
}

describe("(a) Rune Prison is an [Action]: Focus + priority in the showdown's Open state, not bare priority", () => {
  test("combat opens with P1 (attacker) holding Focus: P2 has no menu at all and cannot cast Rune Prison (806.1.b, 345)", async () => {
    const game = await board().build();
    await game.p1.move("brute", "bf1");
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true });
    expect(game.state("brute").combatRole).toBe("attacker");
    expect(game.state("leona").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p2.can("cast", "prison")).toBe(false);
    expect(game.p2.legal()).toEqual([]);
    expect((await game.p2.try((p) => p.cast("prison", { targets: "brute" }))).ok).toBe(false);
    expect(game.zoneOf("prison")).toBe("hand");
  });

  test("P1 (Focus) opens a chain with a Reaction and passes PRIORITY to P2: P2 now holds priority on P1's chain but still no Focus → Rune Prison is NOT offered and an attempt is rejected (806.1 vs 813, 347.1)", async () => {
    const game = await board({ p1Discipline: true }).build();
    await game.p1.move("brute", "bf1");
    await game.p1.cast("discipline", { targets: "brute" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["discipline"]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(showdown(game)?.focusPlayer).toBe(P1);
    expect(game.p2.can("cast", "prison")).toBe(false);
    expect((await game.p2.try((p) => p.cast("prison", { targets: "brute" }))).ok).toBe(false);
    expect(game.zoneOf("prison")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { calm: 1 } });
  });

  test("once P1 passes Focus (347.2.b) P2 holds Focus + priority: Rune Prison IS offered with both units as candidates; casting it on Brute pays 2 + [calm] and starts a chain", async () => {
    const game = await board().build();
    await game.p1.move("brute", "bf1");
    await game.p1.passFocus();
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "prison")).toBe(true);
    const field = game.p2.option("cast", "prison")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
    expect(offered).toEqual(["brute", "leona"]);
    await game.p2.cast("prison", { targets: "brute" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "prison", controller: P2, targets: ["brute"], triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("P2 pass, P1 pass → Rune Prison resolves: Brute is Stunned; the spell's chain closing passes Focus on to P1 (347.1.b); still the same combat showdown", async () => {
    const game = await stunnedAttacker("leona");
    expect(game.state("brute").isStunned).toBe(true);
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1", focusPlayer: P1, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });
});

describe("(b) Leona defends: the stunned attacker is a 1-Might unit — 6 assigned to it is lethal", () => {
  test("while stunned at Leona's battlefield Brute's Might is max(1, 8 − 8) = 1 (continuous, applies the moment the stun lands); Leona stays 6", async () => {
    const game = await stunnedAttacker("leona");
    expect(game.state("brute")).toMatchObject({ baseMight: 8, isStunned: true, might: 1, zone: "battlefield-bf1" });
    expect(game.state("leona").might).toBe(6);
  });

  test("both pass Focus → damage step: P1 (attackers sum 0, 423.1.b) is never handed an assignment decision; if P2 is asked at all it is a single 6-total bucket on Brute whose lethal threshold is 1, not 8 (423.1.c read at current Might)", async () => {
    const game = await stunnedAttacker("leona");
    const seen = await closeShowdownWatching(game);
    expect(seen.some((d) => d.kind === "distribute" && d.seat === P1)).toBe(false);
    const p2Assign = seen.find((d) => d.kind === "distribute" && d.seat === P2);
    if (p2Assign?.kind === "distribute") {
      expect(p2Assign.total).toBe(6);
      expect(p2Assign.buckets.map((b) => [b.card ?? b.key, b.lethal])).toEqual([["brute", 1]]);
      await game.p2.distribute({ [p2Assign.buckets[0]?.key as string]: 6 }); // 465.2.c.4: lone unit takes it all
    }
    await game.settle();
    expect(combatDamageTo(game, "brute")).toBe(6);
    expect(combatDamageTo(game, "leona")).toBe(0);
  });

  test("outcome: Brute (6 ≥ 1) is killed in the Combat Cleanup → P1's trash; Leona undamaged at bf1; the showdown is over and it is P1's open main phase again", async () => {
    const game = await stunnedAttacker("leona");
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.p1.trash()).toContain("brute");
    expect(game.state("leona")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-bf1" });
    expect(showdown(game)).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Step 3: only P2's units remain → P2 WON the combat (466.3.a — probe legend draws P2 exactly 1); P2 already controlled bf1 → no conquer, nobody scores; Contested cleared (466.5/466.5.a)", async () => {
    const game = await stunnedAttacker("leona");
    const p2Hand = game.p2.hand().length; // Rune Prison already spent
    await game.settle();
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0);
  });
});

describe("(c) contrast — a vanilla 6-Might defender: the stunned 8-Might attacker survives 6 and is recalled; No Result", () => {
  test("without Leona the stun does not touch Might: Brute is stunned but still 8; Wall is 6", async () => {
    const game = await stunnedAttacker("vanilla");
    expect(game.state("brute")).toMatchObject({ baseMight: 8, isStunned: true, might: 8, zone: "battlefield-bf1" });
    expect(game.state("wall").might).toBe(6);
  });

  test("damage step: again no assignment for P1 (sum 0); P2's 6 all go to Brute (lethal would be 8); Wall is dealt 0", async () => {
    const game = await stunnedAttacker("vanilla");
    const seen = await closeShowdownWatching(game);
    expect(seen.some((d) => d.kind === "distribute" && d.seat === P1)).toBe(false);
    const p2Assign = seen.find((d) => d.kind === "distribute" && d.seat === P2);
    if (p2Assign?.kind === "distribute") {
      expect(p2Assign.total).toBe(6);
      expect(p2Assign.buckets.map((b) => [b.card ?? b.key, b.lethal])).toEqual([["brute", 8]]);
      await game.p2.distribute({ [p2Assign.buckets[0]?.key as string]: 6 });
    }
    await game.settle();
    expect(combatDamageTo(game, "brute")).toBe(6);
    expect(combatDamageTo(game, "wall")).toBe(0);
  });

  test("6 < 8 → Brute survives; Combat Cleanup 3c heals it to 0 and 3d RECALLS it to P1's base (466.1.a.2) — still stunned for the rest of the turn; Wall untouched at bf1", async () => {
    const game = await stunnedAttacker("vanilla");
    await game.settle();
    expect(game.state("brute")).toMatchObject({ combatRole: null, damage: 0, isStunned: true, might: 8, zone: "base" });
    expect(game.p1.base()).toContain("brute");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.state("wall")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-bf1" });
    expect(showdown(game)).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Step 3: attackers were recalled in 3d → 'No Result' (466.3.d): nobody won — the probe legend draws P2 NOTHING; P2 (units remaining) already controls bf1 → no conquer, no points, Contested cleared", async () => {
    const game = await stunnedAttacker("vanilla");
    const p2Hand = game.p2.hand().length;
    const p1Hand = game.p1.hand().length;
    await game.settle();
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0);
  });

  test("the stun would have lapsed at end of turn anyway (423.1.a.2): after P1 ends the turn Brute is un-stunned in base on P2's turn", async () => {
    const game = await stunnedAttacker("vanilla");
    await game.settle();
    expect(game.state("brute").isStunned).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("brute")).toMatchObject({ isStunned: false, zone: "base" });
  });
});
