/**
 * Interaction: Corina Veraza (sfd-179-221) · Unit · Order · 7+[order] · 6 Might
 *     "[Accelerate] … When I move to a battlefield, play three 1 [Might] Recruit unit tokens here."
 *   × Falling Comet (ogn-085-298) · Spell · Mind · 5 · [Action] — "Deal 6 to a unit at a battlefield."
 *
 * Board: P1's turn, Neutral Open. bfC is empty and uncontrolled. P1 has a READY Corina in base; P2 has a
 * vanilla unit at home (never at bfC) and Falling Comet with exactly 5 energy.
 * Line: Corina Standard-Moves base → bfC; trigger resolves; showdown; P1 passes; P2 (Focus) plays Falling
 * Comet killing Corina — the unit that applied Contested; both pass.
 *
 * Questions / expected:
 *  - Move completes → P1 applies Contested to bfC (450). Corina's move trigger goes on the chain (Closed
 *    State), so the Cleanup STAGES the Showdown (323.8) but 323.12 needs a Neutral OPEN state → it does
 *    not begin yet. The trigger resolves first: three Recruit tokens are PLAYED "here" — at a battlefield
 *    P1 does not control (the effect supplies the location) — exhausted, P1's; bfC is already Contested so
 *    they apply nothing new (190.3.a.1). Chain empties → Neutral Open → Cleanup → the Non-Combat Showdown
 *    begins NOW (344.2 / 316.8.b.1) with P1, the applier, holding Focus (345).
 *  - P1 passes → P2 Focus; Falling Comet on Corina → 6 lethal → she dies in the Cleanup (323.5). The
 *    showdown continues (closes only on consecutive passes, 348) and stays staged: units controlled by
 *    the PLAYER who applied Contested (the Recruits) are still present (323.8.a) so 323.11 does not strip
 *    Contested. Chain closes → Focus P1 (347.1.b); P1 pass, P2 pass → closes; 348.2.a: only P1's units →
 *    P1 establishes control → Conquer (348.2.a.1 / 469.1) +1.
 *  - Contrast (lone contester killed): nobody's units remain → no control, Contested removed (323.11),
 *    no point. Never a combat: the Recruits are never "attackers", nothing is combat-healed.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CORINA = "sfd-179-221";
const FALLING_COMET = "ogn-085-298";

function board() {
  return scenario()
    .battlefield("bfC", { controller: null })
    .unit(P1, "base", CORINA, "corina")
    .unit(P2, "base", { might: 2, name: "P2 Homebody" }, "p2home")
    .resources(P2, { energy: 5 }) // exactly Falling Comet
    .hand(P2, FALLING_COMET, "comet");
}

/** Contrast board: a lone vanilla 6-Might contester instead of Corina. */
function loneBoard() {
  return scenario()
    .battlefield("bfC", { controller: null })
    .unit(P1, "base", { might: 6, name: "Lone Six" }, "six")
    .unit(P2, "base", { might: 2, name: "P2 Homebody" }, "p2home")
    .resources(P2, { energy: 5 })
    .hand(P2, FALLING_COMET, "comet");
}

const activeShowdowns = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);
const recruitsAt = (game: Game, loc: string) =>
  game.p1.units(loc).filter((id) => game.state(id).isToken && game.state(id).name === "Recruit");

/** Corina moved; her trigger is on the chain (nothing resolved yet). */
async function afterMove(): Promise<Game> {
  const game = await board().build();
  expect(game.state("corina").isReady).toBe(true);
  await game.p1.move("corina", "bfC");
  return game;
}

/** …trigger resolved (both passed priority) → Recruits on board, showdown open with P1 Focus. */
async function showdownOpen(): Promise<Game> {
  const game = await afterMove();
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

/** …P1 passed Focus; P2 cast Falling Comet on Corina; both passed priority → it resolved. */
async function cometResolved(): Promise<Game> {
  const game = await showdownOpen();
  await game.p1.passFocus();
  await game.p2.cast("comet", { targets: "corina" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("comet")).toBe("trash");
  return game;
}

describe("Corina Veraza contests, is killed by Falling Comet, and her Recruits still conquer", () => {
  // ── the move, the staged-but-not-begun showdown, the Recruits ────────────────────────────────

  test("the Standard Move exhausts Corina, P1 applies Contested to bfC, and her move trigger goes on the chain (Closed State): the Showdown is only STAGED — it does not begin while the chain is live (450, 323.8, 323.12)", async () => {
    const game = await afterMove();
    expect(game.locationOf("corina")).toBe("bfC");
    expect(game.state("corina").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "corina", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1 });
    expect(activeShowdowns(game)).toEqual([]); // staged, not begun
    expect(recruitsAt(game, "bfC")).toEqual([]); // nothing resolved yet
  });

  test("the trigger resolves BEFORE any showdown: three 1-Might Recruit tokens are PLAYED 'here' at bfC — a battlefield P1 does NOT control — exhausted and P1-controlled; none in base; bfC stays Contested-by-P1 (190.3.a.1)", async () => {
    const game = await showdownOpen();
    expect(game.gameState.battlefields.bfC?.controller).toBeNull();
    const recruits = recruitsAt(game, "bfC");
    expect(recruits).toHaveLength(3);
    for (const r of recruits) {
      expect(game.state(r)).toMatchObject({ baseMight: 1, cardType: "unit", controller: P1, isExhausted: true, isToken: true, might: 1, owner: P1 });
    }
    expect(recruitsAt(game, "base")).toEqual([]);
    expect(game.p1.units("bfC").sort()).toEqual(["corina", ...recruits].sort());
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  });

  test("only once the chain is empty (Neutral Open) does the Cleanup BEGIN the Non-Combat Showdown at bfC, with P1 — who applied Contested — holding Focus; exactly one showdown, not a combat one (344.2, 316.8.b.1, 345)", async () => {
    const game = await showdownOpen();
    expect(game.chain()).toEqual([]);
    expect(activeShowdowns(game)).toHaveLength(1);
    expect(activeShowdowns(game)[0]).toMatchObject({ battlefieldId: "bfC", focusPlayer: P1, isCombatShowdown: false, passedPlayers: [] });
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
    expect(game.p1.points()).toBe(0);
  });

  // ── Falling Comet kills the contester ─────────────────────────────────────────────────────────

  test("P1 passes → P2 holds Focus and may cast Falling Comet ([Action]); Corina and all three Recruits are legal targets (units at a battlefield), P2's base unit is not", async () => {
    const game = await showdownOpen();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P2 });
    expect(game.p2.can("cast", "comet")).toBe(true);
    const offered = (game.p2.option("cast", "comet")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered.sort()).toEqual(["corina", ...recruitsAt(game, "bfC")].sort());
    expect(offered).not.toContain("p2home");
    await game.p2.cast("comet", { targets: "corina" });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "comet", controller: P2 })]);
  });

  test("Falling Comet resolves: 6 to the 6-Might Corina is lethal → she is in P1's trash after the Cleanup (323.5); the three Recruits are untouched at bfC", async () => {
    const game = await cometResolved();
    expect(game.zoneOf("corina")).toBe("trash");
    expect(game.p1.trash()).toContain("corina");
    const recruits = recruitsAt(game, "bfC");
    expect(recruits).toHaveLength(3);
    for (const r of recruits) {
      expect(game.state(r)).toMatchObject({ damage: 0, might: 1 });
    }
  });

  test("killing the unit that applied Contested does NOT collapse the showdown: bfC stays Contested-by-P1 (P1's Recruits are still there — 323.8.a, so 323.11 does not apply), the same single showdown is open and Focus has passed to P1 after the chain closed (347.1.b, 348)", async () => {
    const game = await cometResolved();
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(activeShowdowns(game)).toHaveLength(1);
    expect(activeShowdowns(game)[0]).toMatchObject({ battlefieldId: "bfC", focusPlayer: P1, isCombatShowdown: false, passedPlayers: [] });
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
    expect(game.p1.points()).toBe(0); // not yet
  });

  test("P1 pass, P2 pass → the showdown closes; only P1's units (three Recruits) remain and P1 did not control bfC → P1 establishes control = CONQUER, +1 point; final: bfC P1 with three 1-Might Recruits, Corina in trash (348.2.a, 348.2.a.1, 469.1)", async () => {
    const game = await cometResolved();
    await game.p1.passFocus();
    await game.p2.passFocus();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(activeShowdowns(game)).toEqual([]);
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["bfC"]);
    const recruits = recruitsAt(game, "bfC");
    expect(recruits).toHaveLength(3);
    expect(game.p1.units("bfC").sort()).toEqual(recruits.sort());
    for (const r of recruits) {
      expect(game.state(r)).toMatchObject({ might: 1, damage: 0, isExhausted: true });
    }
    expect(game.zoneOf("corina")).toBe("trash");
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("never a combat: no showdown in the line is a Combat Showdown, the Recruits (and Corina) never carry an attacker/defender designation, and P2's home unit is never involved", async () => {
    const game = await afterMove();
    const noCombat = () => {
      for (const s of activeShowdowns(game)) {
        expect(s.isCombatShowdown).toBe(false);
      }
      for (const u of [...game.p1.units(), ...game.p2.units()]) {
        expect(game.state(u).combatRole).toBeNull();
      }
    };
    noCombat();
    await game.p1.passPriority();
    await game.p2.passPriority();
    noCombat();
    await game.p1.passFocus();
    noCombat();
    await game.p2.cast("comet", { targets: "corina" });
    noCombat();
    await game.p2.passPriority();
    await game.p1.passPriority();
    noCombat();
    await game.p1.passFocus();
    noCombat();
    await game.p2.passFocus();
    await game.settle();
    noCombat();
    expect(game.zoneOf("p2home")).toBe("base");
    expect(game.state("p2home").damage).toBe(0);
  });

  // ── contrast: the lone contester ──────────────────────────────────────────────────────────────

  test("contrast — lone contester: a vanilla 6-Might unit moves in alone (showdown begins at once, no trigger), P1 passes, Falling Comet kills it; the showdown still only closes on passes, but then NOBODY's units remain → no control, Contested removed (323.11), no point for anyone", async () => {
    const game = await loneBoard().build();
    await game.p1.move("six", "bfC");
    expect(game.chain()).toEqual([]);
    expect(activeShowdowns(game)[0]).toMatchObject({ battlefieldId: "bfC", focusPlayer: P1, isCombatShowdown: false });
    await game.p1.passFocus();
    await game.p2.cast("comet", { targets: "six" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("six")).toBe("trash");
    // the showdown did not collapse on the death either — it takes the passes
    expect(activeShowdowns(game)).toHaveLength(1);
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
    await game.p1.passFocus();
    await game.p2.passFocus();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(activeShowdowns(game)).toEqual([]);
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: null });
    expect(game.cardsAt("battlefield-bfC")).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — P2 just passes instead of casting: Corina + three Recruits conquer bfC for P1 (+1) and Corina lives", async () => {
    const game = await showdownOpen();
    await game.p1.passFocus();
    await game.p2.passFocus();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.locationOf("corina")).toBe("bfC");
    expect(recruitsAt(game, "bfC")).toHaveLength(3);
    expect(game.p2.hand()).toContain("comet");
  });
});
