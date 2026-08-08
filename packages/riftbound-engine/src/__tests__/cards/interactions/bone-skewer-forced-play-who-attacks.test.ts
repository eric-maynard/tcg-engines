/**
 * Interaction: Bone Skewer (unl-139-219) · Spell · Chaos · 2 + [chaos] · [Hidden]
 *     "Choose a battlefield. An opponent reveals their hand. You may choose a unit from it. They play
 *      that unit to that battlefield, ignoring any and all costs. When they do, [Stun] it."
 *   × Lucian, Gunslinger (sfd-028-221) · Champion Unit · Fury · 3 · 2 Might
 *     "[Assault] When I attack, deal damage equal to my [Assault] to an enemy unit here."
 *   × Sunlit Guardian (ogn-054-298) · Unit · Calm · 3 · 3 Might · [Shield] [Tank]
 *
 * Rules: 355.2.b (an effect makes the named battlefield a valid play location), 190.3.a.1 (a unit PLAYED
 * TO a battlefield its controller doesn't control applies Contested — by that controller), 323.8 / 323.9
 * / 323.12 / 323.13 (staging + beginning Showdown / Combat at the Neutral Open cleanup), 344.2 / 345
 * (Non-Combat Showdown, contesting player has Focus), 348.2.a.1 (establishing control = Conquer),
 * 464.2.c.1 / 464.2.d (Attacker = the player whose unit applied Contested; the attacker gains Focus),
 * 383.4.e ("When I attack" fires on gaining the attacker designation), 807.1.c (Assault live while
 * attacking), 814.1.c (Shield live while defending), 423.1.b (Stunned → no combat-damage contribution),
 * 423.1.c (a Stunned unit still needs full-Might damage to die), 464.2.c.3, 466.3.a, 466.1.a.1 (combat
 * cleanup heals).
 *
 * Question: P1's turn. P1 controls bfA (Sunlit Guardian), P2 controls bfB, bfC is uncontrolled. P2's hand
 * holds Lucian, Gunslinger. P1 casts Bone Skewer.
 *   YES  — name bfA, pick Lucian: who controls him, who contests / attacks / has Focus on P1's turn, does
 *          stunned Lucian still get Assault and his attack trigger, outcome?
 *   NO-1 — name bfC: what is staged, who has Focus, can P2 conquer on P1's turn?
 *   NO-2 — name bfB (P2's own): anything staged?
 *   PARITY — compare YES with P2 simply Standard-Moving Lucian into bfA on P2's turn.
 *
 * Expected: P2 plays Lucian (P2 controls him), free, exhausted, Stunned. YES: bfA Contested BY P2 → combat
 * on P1's turn with P2 as Attacker holding Focus; Lucian 3 Might (Assault), trigger deals 1 to Guardian;
 * Guardian defends at 4 (Shield); damage step: Lucian contributes 0, Guardian's 4 ≥ 3 kills Lucian; P1
 * keeps bfA, no points, Guardian healed. NO-1: bfC Contested by P2 → Non-Combat Showdown with P2 on Focus;
 * all pass → P2 conquers bfC, +1 for P2 on P1's turn. NO-2: nothing staged; Lucian sits at bfB stunned +
 * exhausted. PARITY: same roles/Might/trigger as YES, minus the Stun (so Lucian's 3 + 1 kills Guardian too).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BONE_SKEWER = "unl-139-219";
const LUCIAN = "sfd-028-221";
const SUNLIT_GUARDIAN = "ogn-054-298";

/** P1's turn 2. bfA: P1's with Sunlit Guardian. bfB: P2's with a Holder. bfC: uncontrolled, empty. P2's hand: Lucian + a spell. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .resources(P2, { energy: 0 })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .battlefield("bfC", { controller: null })
    .unit(P1, "bfA", SUNLIT_GUARDIAN, "guardian")
    .unit(P2, "bfB", { might: 2, name: "Holder" }, "holder")
    .hand(P2, LUCIAN, "lucian")
    .hand(P2, { abilities: [], cardType: "spell", energyCost: 1, name: "Junk Spell", timing: "action" }, "junk")
    .hand(P1, BONE_SKEWER, "bs");
}

/** Cast Bone Skewer naming `bf`, resolve to the reveal-and-pick prompt, pick Lucian. */
async function skewerLucianTo(bf: "bfA" | "bfB" | "bfC"): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("bs", { targets: bf });
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  const d = game.decision() as PickDecision;
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
  expect(d.options.map((o) => o.card ?? o.key)).toEqual(["lucian"]); // the spell is revealed but not offered
  await game.p1.pick("lucian");
  return game;
}

describe("Bone Skewer × Lucian, Gunslinger × Sunlit Guardian — the opponent's forced play attacks YOU on your turn", () => {
  // ---- common: who plays / controls / pays ------------------------------------------------------------

  test("premise: Bone Skewer offers all three battlefields as 'Choose a battlefield' (355.2.b makes any of them a valid play location)", async () => {
    const game = await board().build();
    const offered = game.p1.option("cast", "bs")?.fields.find((f) => f.arg === "targets")?.options;
    expect(offered).toEqual([["bfA"], ["bfB"], ["bfC"]]);
  });

  test("THEY play him: Lucian lands at the named battlefield under P2's control (owner P2), for free at 0 resources, exhausted (143.4) and Stunned", async () => {
    const game = await skewerLucianTo("bfA");
    const s = game.state("lucian");
    expect(s.zone).toBe("battlefield-bfA");
    expect(s.controller).toBe(P2);
    expect(s.owner).toBe(P2);
    expect(s.isExhausted).toBe(true);
    expect(s.isStunned).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p2.units("bfA")).toEqual(["lucian"]);
    expect(game.p1.units("bfA")).toEqual(["guardian"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  // ---- YES: named bfA (P1's own, occupied) --------------------------------------------------------------

  test("YES: being played to bfA applies Contested — BY P2, not by the caster (190.3.a.1); control of bfA does not change", async () => {
    const game = await skewerLucianTo("bfA");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
  });

  test("YES: by the time Combat begins Bone Skewer has fully left the chain (→ trash) and Lucian is already Stunned; P2 is the Attacker and holds Focus/priority first although it is P1's turn (323.13, 464.2.c.1, 464.2.d)", async () => {
    const game = await skewerLucianTo("bfA");
    if (game.p1.can("startShowdown")) {
      await game.p1.choose("startShowdown:bfA");
    }
    expect(game.zoneOf("bs")).toBe("trash");
    expect(game.chain().some((c) => c.cardId === "bs")).toBe(false);
    expect(game.state("lucian").isStunned).toBe(true);
    expect(game.state("lucian").combatRole).toBe("attacker");
    expect(game.state("guardian").combatRole).toBe("defender");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.actingSeat()).toBe(P2);
  });

  test("YES: Stun does not switch off abilities — Lucian gains Attacker so Assault is live (3 Might) and 'When I attack' is on the chain under P2's control aimed at Guardian (383.4.e, 807.1.c); Guardian defends at 4 (Shield)", async () => {
    const game = await skewerLucianTo("bfA");
    if (game.p1.can("startShowdown")) {
      await game.p1.choose("startShowdown:bfA");
    }
    expect(game.state("lucian").might).toBe(3);
    expect(game.state("guardian").might).toBe(4);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lucian", controller: P2, triggered: true })]);
    // Resolve just the trigger: 1 damage (his Assault value) to the enemy unit here.
    await game.p2.passPriority();
    await game.p1.passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("guardian");
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("guardian").damage).toBe(1);
    expect(game.zoneOf("guardian")).toBe("battlefield-bfA");
    // Still in the combat showdown, attacker (P2) on Focus.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("YES outcome: Stunned Lucian contributes 0 (423.1.b), Guardian's 4 ≥ 3 kills him (423.1.c); P1 wins as defender and keeps bfA, nobody scores, Guardian healed at combat cleanup, still P1's turn", async () => {
    const game = await skewerLucianTo("bfA");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("lucian")).toBe("trash");
    expect(game.p2.trash()).toContain("lucian");
    expect(game.zoneOf("guardian")).toBe("battlefield-bfA");
    expect(game.state("guardian").damage).toBe(0); // the trigger's 1 was healed (466.1.a.1); Lucian dealt no combat damage
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0); // already controlled bfA — holding off an attack scores nothing now
    expect(game.p2.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.actingSeat()).toBe(P1);
    expect(game.zoneOf("bs")).toBe("trash");
  });

  // ---- NO-1: named bfC (empty, uncontrolled) ------------------------------------------------------------

  test("NO-1: played to empty bfC, Lucian contests it for P2 (190.3.a.1) → a Non-Combat Showdown opens at the cleanup with P2 holding Focus first, then P1 (323.12, 344.2, 345)", async () => {
    const game = await skewerLucianTo("bfC");
    expect(game.zoneOf("lucian")).toBe("battlefield-bfC");
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    if (game.p1.can("startShowdown")) {
      await game.p1.choose("startShowdown:bfC");
    }
    expect(game.state("lucian").combatRole).toBeNull(); // no combat: nobody else is there
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("NO-1 outcome: everyone passes → P2 establishes control of bfC = Conquer, +1 for P2 ON P1's TURN (348.2.a.1); the Stun was irrelevant (no damage step) and Lucian stays there stunned/exhausted", async () => {
    const game = await skewerLucianTo("bfC");
    await game.settle(); // hands the auto-begun showdown back once…
    await game.settle(); // …then passes Focus for both
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("lucian")).toMatchObject({ controller: P2, isExhausted: true, isStunned: true, zone: "battlefield-bfC" });
    expect(game.actingSeat()).toBe(P1); // back to P1's open main phase
  });

  // ---- NO-2: named bfB (P2's own) -----------------------------------------------------------------------

  test("NO-2: played to P2's own bfB nothing is Contested or staged (190.3.a.1) — no showdown, no chain, no points; Lucian just sits there stunned + exhausted at 2 Might", async () => {
    const game = await skewerLucianTo("bfB");
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P2 });
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.p1.can("startShowdown")).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.state("lucian")).toMatchObject({ combatRole: null, controller: P2, isExhausted: true, isStunned: true, might: 2, zone: "battlefield-bfB" });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.legal().map((o) => o.verb)).toEqual(expect.arrayContaining(["endTurn"]));
  });

  // ---- PARITY: P2 attacks bfA the ordinary way on P2's turn -----------------------------------------------

  test("PARITY: P2 Standard-Moving Lucian base→bfA on P2's turn is role-for-role the YES case — P2 attacker on Focus, Lucian 3 (Assault) with his trigger on the chain at Guardian, Guardian defending at 4 (Shield)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bfA", { controller: P1 })
      .unit(P1, "bfA", SUNLIT_GUARDIAN, "guardian")
      .unit(P2, "base", LUCIAN, "lucian")
      .build();
    await game.p2.move("lucian", "bfA");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.state("lucian").combatRole).toBe("attacker");
    expect(game.state("guardian").combatRole).toBe("defender");
    expect(game.actingSeat()).toBe(P2);
    expect(game.state("lucian").might).toBe(3);
    expect(game.state("guardian").might).toBe(4);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lucian", controller: P2, triggered: true })]);
    expect(game.state("lucian").isStunned).toBe(false); // the one difference
  });

  test("PARITY outcome differs only by the Stun: un-stunned Lucian's trigger 1 + combat 3 = 4 kills the 4-Might (Shield) Guardian while Guardian's 4 kills him — both to trash, bfA left uncontrolled, no conquer", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bfA", { controller: P1 })
      .unit(P1, "bfA", SUNLIT_GUARDIAN, "guardian")
      .unit(P2, "base", LUCIAN, "lucian")
      .build();
    await game.p2.move("lucian", "bfA");
    await game.settle();
    expect(game.zoneOf("lucian")).toBe("trash");
    expect(game.zoneOf("guardian")).toBe("trash");
    expect(game.gameState.battlefields.bfA?.controller).toBeNull();
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0);
  });
});
