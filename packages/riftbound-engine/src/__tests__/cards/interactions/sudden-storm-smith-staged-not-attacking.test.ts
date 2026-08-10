/**
 * Interaction: Apprentice Smith (sfd-041-221) · Unit · Calm · 2 · 2 Might
 *     "When I move, reveal the top card of your Main Deck. If it's a gear, draw it. Otherwise, recycle it."
 *   × Sudden Storm (sfd-017-221) · Spell · Fury · 3 · [Hidden] [Action]
 *     "Deal 2 to a unit at a battlefield. If it's attacking, deal 4 to it instead."
 *   × Glorious Executioner (sfd-185-221) · Legend · "When you win a combat, draw 1."
 *   vs a vanilla Shipyard Skulker (ogn-175-298, 3 Might) holding bf1 for P2.
 *
 * Question: P1's turn, Neutral Open. P2 controls bf1 with the Skulker, P2's legend is Glorious
 * Executioner and P2 hid Sudden Storm at bf1 on an earlier turn. P1 Standard-Moves Apprentice Smith
 * alone into bf1; Smith's mandatory move trigger goes on the chain.
 *   (A) P1 passes priority; P2 flips Sudden Storm for [0] on Smith while the trigger is pending. Is
 *       Smith "attacking" yet (2 or 4)? After Smith dies: does any showdown/combat ever open, is Focus
 *       ever given, is there an assignment Decision, does the Executioner draw, does anyone conquer,
 *       what happens to bf1's Contested status and to the still-pending move trigger?
 *   (B) Contrast: P2 lets the trigger resolve → combat opens; P1 (Attacker, Focus) passes; P2 flips
 *       Storm on Smith now — how much damage, and what happens at Steps 2 and 3?
 *
 * Rules: 461 / 461.2 (Combat Staged; a Staged combat that stops being staged is never executed),
 * 323.8.a / 323.9.a / 323.10 / 323.11 (Showdown/Combat staged; lapse when the units leave; Contested
 * removed), 323.13 (Combat begins only in a Neutral Open State), 320.1 (chain = Closed), 464.2.c.3
 * (Attacker/Defender designations are assigned when combat OPENS), 465.1 (damage step needs both
 * sides), 466.3.a (sole remaining designated player won), 466.4 (win triggers), 466.5 (control),
 * 811.1.b (flip for 0 at Reaction speed), 811.1.d.2 (target from that battlefield).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const APPRENTICE_SMITH = "sfd-041-221";
const SUDDEN_STORM = "sfd-017-221";
const GLORIOUS_EXECUTIONER = "sfd-185-221";
const SHIPYARD_SKULKER = "ogn-175-298";

/**
 * P1's turn 2. bf1: P2's, Skulker (3) + facedown Sudden Storm (hidden on turn 0). P2's legend is the
 * Executioner. Smith (2) in P1's base; P1's top card is a non-gear so the trigger recycles it.
 * `smithMeta` lets a variant make Smith 5 Might so the 2-vs-4 damage is directly observable.
 */
function board(smithMeta?: { mightModifier: number }) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .legend(P2, GLORIOUS_EXECUTIONER, "exec")
    .unit(P2, "bf1", SHIPYARD_SKULKER, "skulker")
    .facedown(P2, "bf1", SUDDEN_STORM, "storm")
    .unit(P1, "base", APPRENTICE_SMITH, "smith", smithMeta)
    .deckTop(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Top Filler" }, "topcard");
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;
const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** P2 flips the facedown Storm and names Smith (asked at finalize, 811.1.d.2). */
async function flipStormOnSmith(game: Game): Promise<void> {
  await game.p2.reveal("storm");
  const d = game.decision();
  if (d?.kind === "pick") {
    expect(d).toMatchObject({ seat: P2, semantics: "target", timing: "FIN" });
    await game.p2.pick("smith");
  }
}

/** (A) Smith moves in; with its trigger pending P1 passes and P2 flips Storm on Smith. Storm is on top. */
async function caseA_stormOnChain(smithMeta?: { mightModifier: number }): Promise<Game> {
  const game = await board(smithMeta).build();
  await game.p1.move("smith", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "smith", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  await flipStormOnSmith(game);
  return game;
}

/** (B) Smith moves in; both pass so the trigger resolves and combat opens; P1 passes Focus; P2 flips Storm on Smith. */
async function caseB_stormOnChain(smithMeta?: { mightModifier: number }): Promise<Game> {
  const game = await board(smithMeta).build();
  await game.p1.move("smith", "bf1");
  await game.p1.passPriority();
  await game.p2.passPriority(); // trigger resolves → chain empty → 323.13 combat begins
  expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", focusPlayer: P1, isCombatShowdown: true });
  await game.p1.passFocus();
  expect(game.actingSeat()).toBe(P2);
  await flipStormOnSmith(game);
  return game;
}

describe("Sudden Storm on Apprentice Smith — staged (not attacking) vs open combat (attacking)", () => {
  // ── (A) the position while the move trigger is pending ─────────────────────────────────────

  test("(A) after the Standard Move, bf1 is Contested by P1 and a combat is STAGED, but the mandatory move trigger keeps the state Closed: no showdown open, no designations, nobody has Focus (461, 323.13, 320.1, 464.2.c.3)", async () => {
    const game = await board().build();
    await game.p1.move("smith", "bf1");
    expect(game.locationOf("smith")).toBe("bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "smith", triggered: true, type: "ability" })]);
    expect(bf1(game)).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(showdown(game)).toBeUndefined();
    expect(game.state("smith").combatRole).toBeNull();
    expect(game.state("skulker").combatRole).toBeNull();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(A) once P1 passes priority, P2 may flip the facedown Sudden Storm for [0] (811.1.b); its target must be a unit at bf1 — Smith and Skulker are offered (811.1.d.2) — and it lands above the trigger", async () => {
    const game = await board().build();
    await game.p1.move("smith", "bf1");
    await game.p1.passPriority();
    expect(game.p2.can("reveal", "storm")).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    await game.p2.reveal("storm");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card).sort()).toEqual(["skulker", "smith"]);
    }
    await game.p2.pick("smith");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} }); // paid nothing
    expect(game.chain().map((c) => c.cardId)).toEqual(["smith", "storm"]);
    expect(game.chain()[1]).toMatchObject({ controller: P2, targets: ["smith"], triggered: false, type: "spell" });
  });

  test("(A) Smith is NOT attacking while combat is merely staged → Storm deals 2, not 4 (observable on a 5-Might Smith: 2 damage marked, alive)", async () => {
    const game = await caseA_stormOnChain({ mightModifier: 3 });
    expect(game.state("smith").might).toBe(5);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Storm resolves
    expect(game.zoneOf("storm")).toBe("trash");
    expect(game.locationOf("smith")).toBe("bf1");
    expect(game.state("smith").damage).toBe(2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["smith"]); // trigger still pending underneath
  });

  test("(A) on the printed 2-Might Smith the 2 is lethal: Smith dies in the Cleanup after Storm resolves, while its move trigger is STILL on the chain", async () => {
    const game = await caseA_stormOnChain();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("storm")).toBe("trash");
    expect(game.p2.trash()).toContain("storm");
    expect(game.zoneOf("smith")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "smith", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("(A) with Smith gone the staged Combat/Showdown lapse and Contested is removed from bf1 right away (323.8.a, 323.10, 323.11, 461.2); P2 still controls bf1", async () => {
    const game = await caseA_stormOnChain();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(bf1(game)?.contestedBy).toBeUndefined();
    expect(showdown(game)).toBeUndefined();
    expect(game.state("skulker").combatRole).toBeNull();
  });

  test("(A) Smith's move trigger still resolves normally although its source is dead: the non-gear top card is revealed and recycled to the bottom of P1's deck (hand unchanged)", async () => {
    const game = await caseA_stormOnChain();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Storm
    const hand = game.p1.hand().length;
    expect(game.p1.deck()[0]).toBe("topcard");
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.zoneOf("topcard")).toBe("mainDeck");
    expect(game.p1.deck()[0]).not.toBe("topcard");
    expect(game.p1.deck().at(-1)).toBe("topcard");
  });

  test("(A) when the chain empties: Neutral Open on P1's turn — no showdown ever opened, no Focus, no assignment Decision, Executioner did NOT draw, no conquer/points, P2 keeps bf1, Storm in P2's trash", async () => {
    const game = await caseA_stormOnChain();
    const p2Hand = game.p2.hand().length;
    const p2Deck = game.p2.deck().length;
    let sawShowdown = false;
    let sawDistribute = false;
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
      sawShowdown ||= showdown(game) !== undefined || (game.decision() as { context?: string } | null)?.context === "showdown";
      sawDistribute ||= game.decision()?.kind === "distribute";
    }
    expect(sawShowdown).toBe(false);
    expect(sawDistribute).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("smith")).toBe("trash");
    expect(game.zoneOf("storm")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.state("skulker")).toMatchObject({ combatRole: null, damage: 0 });
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.hand()).toHaveLength(p2Hand); // Glorious Executioner never triggered
    expect(game.p2.deck()).toHaveLength(p2Deck);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.scoredThisTurn[P1]).toEqual([]);
    expect(game.gameState.scoredThisTurn[P2]).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (B) contrast: the trigger resolves first, combat opens ─────────────────────────────────

  test("(B) both pass on the trigger → chain empty → combat BEGINS at bf1: P1 Attacker with Focus, Smith attacker, Skulker defender (323.13, 464.2.c.3)", async () => {
    const game = await board().build();
    await game.p1.move("smith", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("smith").combatRole).toBe("attacker");
    expect(game.state("skulker").combatRole).toBe("defender");
    expect(bf1(game)).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
  });

  test("(B) P1 passes Focus; P2 (now with Focus) may flip Storm on Smith — Smith IS attacking → 4 damage (observable on a 5-Might Smith: 4 marked)", async () => {
    const game = await caseB_stormOnChain({ mightModifier: 3 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "storm", controller: P2, targets: ["smith"] })]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("storm")).toBe("trash");
    expect(game.locationOf("smith")).toBe("bf1");
    expect(game.state("smith").damage).toBe(4);
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: true }); // still in the showdown
  });

  test("(B) on the printed 2-Might Smith the 4 is lethal: Smith is killed at the next Cleanup, but the combat showdown stays open until both pass (Focus back to P1)", async () => {
    const game = await caseB_stormOnChain();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("smith")).toBe("trash");
    expect(game.zoneOf("storm")).toBe("trash");
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("(B) both pass Focus → Step 2 is skipped (465.1: no attacking units) — no assignment Decision, Skulker takes nothing; Step 3: P2 (Defender, sole side left) won → Glorious Executioner's trigger goes on the chain (466.3.a, 466.4)", async () => {
    const game = await caseB_stormOnChain();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Storm resolves, Smith dies
    await game.acting().passFocus();
    expect(game.decision()?.kind).not.toBe("distribute");
    await game.acting().passFocus(); // showdown closes
    expect(game.decision()?.kind).not.toBe("distribute");
    expect(game.state("skulker").damage).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "exec", controller: P2, triggered: true, type: "ability" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("(B) end state: P2 drew exactly 1 off the Executioner, P2 still controls bf1 (no conquer, no points for anyone), Contested cleared, designations gone, back to P1's Neutral Open main phase", async () => {
    const game = await caseB_stormOnChain();
    const p2Hand = game.p2.hand().length;
    const p2Deck = game.p2.deck().length;
    const p1Hand = game.p1.hand().length;
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toBeUndefined();
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p2.deck()).toHaveLength(p2Deck - 1);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.zoneOf("smith")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.state("skulker")).toMatchObject({ combatRole: null, damage: 0 });
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.scoredThisTurn[P2]).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
