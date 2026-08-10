/**
 * Interaction: Irresistible Faefolk (unl-112-219) · 1 Might · "When I move to a battlefield, you may move an
 *   enemy unit to that battlefield."
 *   × Shipyard Skulker (ogn-175-298) · vanilla 3 Might (the dragged enemy)
 *   × Cleave (ogn-004-298) · [1] Fury · "[Action] Give a unit [Assault 3] this turn."
 *
 * Question: P1's turn, Neutral Open. P2's Skulker sits at P2-held bfB; P2 holds Cleave. (A) P1 Standard-Moves
 * Faefolk base → bfA which P1 ALREADY controls (a P1 vanilla 4 is there); the trigger drags Skulker to bfA.
 * (B) P1 moves Faefolk base → empty uncontrolled bfC; the trigger drags Skulker to bfC. In each branch: who
 * applied Contested, who is Attacker, who gains Focus when the showdown opens (on P1's turn), and can P2 fire
 * Cleave immediately or must P2 wait for P1 to pass? Also: the trigger's chain empties right BEFORE the
 * showdown opens — is there any moment where a showdown exists with focus = null?
 *
 * Rules: 190.3.a / 190.3.a.1 (Contested is applied by a unit arriving where its controller does not control,
 * and only if not already Contested), 344 / 344.1 / 461.3 (showdown/combat open at a Cleanup in Neutral Open;
 * both staged → Combat Showdown), 464.2.c.1 / .c.1.a / .c.2 (Attacker = the player whose unit applied Contested,
 * and that player gains Focus; Defender = the other), 345 / 313.2 (Focus comes with Priority), 313.4 / 312.1.b
 * (no discretionary action without Focus+Priority), 313.5 (Neutral state → nobody has Focus), 347.1 / 347.1.b /
 * 347.2.b / 346 (Focus holder may play an Action; Focus passes when that chain closes or on a pass), 420.3.a (an
 * effect-move does not exhaust), 807.1.c + 142.4.b + 466.1/466.7.a (Assault is real Might while Attacker, and
 * the kill check of the Combat Cleanup happens BEFORE designations are removed), 465.2.c.3 (lethal in full
 * before the next unit), 466.3.a / 466.5 / 466.5.b / 466.5.d / 466.5.e (winner with units establishes control →
 * Conquer, need not be the contester; nobody left → uncontrolled).
 *
 * Expected: common — the move trigger is a chain item in a NEUTRAL Closed state (no showdown, focus null is
 * legitimate); it resolves, Skulker is moved unexhausted; the showdown opens at the next Cleanup with a
 * non-null focus. (A) Faefolk applies nothing at P1's own bfA; Skulker's arrival applies Contested → P2 is
 * Attacker and gains Focus+Priority on P1's turn; P2 may Cleave at once, P1 has no legal action; after
 * Cleave's chain closes Focus passes to P1. Combat with Cleave: Skulker 3+3 = 6 kills both defenders (1 + 4);
 * the defenders' 5 on a 6-Might attacker is NOT lethal (Assault still applies at the Combat Cleanup) → Skulker
 * survives, P2 wins and conquers bfA (+1). Without Cleave (P2 assigns 1 to Faefolk, 2 to the 4): Faefolk dies,
 * Skulker (5 ≥ 3) dies, P1 keeps bfA. (B) Faefolk applies Contested at bfC, Skulker's arrival does not re-apply
 * it → Attacker = P1, Defender = P2 (defending on P1's turn with the unit P1 dragged in), Focus = P1; P2 cannot
 * Cleave until P1 passes Focus. All pass: Faefolk 1 vs Skulker 3 → Faefolk dies, P2 wins and CONQUERS bfC on
 * P1's turn (+1).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FAEFOLK = "unl-112-219";
const SKULKER = "ogn-175-298";
const CLEAVE = "ogn-004-298";

/** P1's turn 2, Neutral Open. bfA: P1 (vanilla 4 there). bfB: P2 (Skulker there). bfC: empty, uncontrolled. */
function board() {
  return scenario()
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .battlefield("bfC", { controller: null })
    .unit(P1, "base", FAEFOLK, "faefolk")
    .unit(P1, "bfA", { might: 4, name: "Vanilla Four" }, "four")
    .unit(P2, "bfB", SKULKER, "skulker")
    .hand(P2, CLEAVE, "cleave");
}

type Showdown = {
  active?: boolean;
  attackingPlayer?: string | null;
  defendingPlayer?: string | null;
  battlefieldId?: string;
  focusPlayer?: string | null;
  isCombatShowdown?: boolean;
};

/** The current (top) showdown frame, or undefined when no showdown exists. */
const showdown = (game: Game): Showdown | undefined =>
  (game.gameState.interaction?.showdownStack as Showdown[] | undefined)?.at(-1);

/** Move Faefolk, accept the "you may", name Skulker → the trigger is finalized on the chain, P1 has priority. */
async function moveAndDrag(game: Game, to: "bfA" | "bfC"): Promise<void> {
  await game.p1.move("faefolk", to);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("skulker");
  }
}

/** …then both pass priority: the trigger resolves, the chain empties, the Cleanup opens the showdown. */
async function dragResolved(to: "bfA" | "bfC"): Promise<Game> {
  const game = await board().build();
  await moveAndDrag(game, to);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Irresistible Faefolk drags Skulker — to P1's own bfA vs to open bfC: who attacks, who has Focus", () => {
  // ── common: the trigger window is Neutral Closed ──────────────────────────────────────

  test("common: the move trigger is a chain item controlled by P1 in a NEUTRAL Closed state — no showdown exists yet (344), so focus = null is legitimate (313.5); P1 holds priority", async () => {
    for (const to of ["bfA", "bfC"] as const) {
      const game = await board().build();
      await moveAndDrag(game, to);
      expect(game.chain()).toEqual([expect.objectContaining({ cardId: "faefolk", controller: P1, triggered: true })]);
      expect(showdown(game)).toBeUndefined();
      expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
      expect(game.locationOf("skulker")).toBe("bfB"); // nothing dragged until it resolves
      await game.p1.passPriority();
      expect(showdown(game)).toBeUndefined(); // still no showdown while the item is on the chain
      expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    }
  });

  test("common: on resolution Skulker is MOVED by an effect — it arrives ready (420.3.a) while Faefolk, which Standard-Moved, is exhausted; the chain is empty", async () => {
    for (const to of ["bfA", "bfC"] as const) {
      const game = await dragResolved(to);
      expect(game.locationOf("skulker")).toBe(to);
      expect(game.state("skulker").isExhausted).toBe(false);
      expect(game.locationOf("faefolk")).toBe(to);
      expect(game.state("faefolk").isExhausted).toBe(true);
      expect(game.chain()).toEqual([]);
    }
  });

  test("common: from the instant a showdown exists its focus is non-null — the frame the Cleanup opens already names a focus player and that seat holds the decision", async () => {
    for (const to of ["bfA", "bfC"] as const) {
      const game = await dragResolved(to);
      const sd = showdown(game);
      expect(sd?.active).toBe(true);
      expect(sd?.focusPlayer ?? null).not.toBeNull();
      expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: sd?.focusPlayer });
    }
  });

  // ── (A) dragged to P1's own bfA ───────────────────────────────────────────────────────

  test("(A) Faefolk applies nothing at P1-controlled bfA (190.3.a.1); Skulker's arrival applies Contested — contestedBy = P2, control still P1", async () => {
    const game = await board().build();
    await moveAndDrag(game, "bfA");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
  });

  test("(A) Combat opens at bfA with Attacker = P2, Defender = P1 (464.2.c.1/.c.2): Skulker attacker, Faefolk + Vanilla Four defenders; no triggers → no Combat Chain", async () => {
    const game = await dragResolved("bfA");
    expect(showdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bfA", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("skulker").combatRole).toBe("attacker");
    expect(game.state("faefolk").combatRole).toBe("defender");
    expect(game.state("four").combatRole).toBe("defender");
    expect(game.chain()).toEqual([]);
  });

  test("(A) on P1's turn it is P2 who gains Focus + Priority as the showdown begins (345, 464.2.c.1.a, 313.2) — triple (focus P2, deciding P2, showdown-open)", async () => {
    const game = await dragResolved("bfA");
    expect(game.turnPlayer()).toBe(P1);
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("(A) P2 may play Cleave AT ONCE (347.1); P1, the turn player, has no legal action until Focus/Priority reaches him (313.4)", async () => {
    const game = await dragResolved("bfA");
    expect(game.p2.can("cast", "cleave")).toBe(true);
    expect(game.p1.legal()).toEqual([]);
    await game.p2.cast("cleave", { targets: "skulker" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cleave", controller: P2 })]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 1 } }); // Cleave is [1], no power
  });

  test("(A) after Cleave's chain closes Skulker has Assault 3 (reads 6 as an attacker, 807.1.c) and Focus passes to P1 (347.1.b/346)", async () => {
    const game = await dragResolved("bfA");
    await game.p2.cast("cleave", { targets: "skulker" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("skulker").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("skulker").might).toBe(6);
    expect(showdown(game)?.focusPlayer).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("(A) combat WITH Cleave: Skulker's 6 kills both defenders (lethal in full: 4 + 1, 465.2.c.3); the defenders' 5 on a 6-Might attacker is not lethal at the Combat Cleanup (142.4.b, 466.1 before 466.7.a) → Skulker survives healed, P2 wins and CONQUERS bfA on P1's turn (466.5/.d)", async () => {
    const game = await dragResolved("bfA");
    await game.p2.cast("cleave", { targets: "skulker" });
    const r = await game.settle(); // Cleave resolves, both pass Focus, combat resolves
    expect(r.reason).toBe("open");
    expect(game.zoneOf("faefolk")).toBe("trash");
    expect(game.zoneOf("four")).toBe("trash");
    expect(game.state("skulker")).toMatchObject({ damage: 0, zone: "battlefield-bfA" });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(A) combat WITHOUT Cleave: P2 (attacker) assigns first — 1 to Faefolk (lethal), 2 to the 4; defenders' 5 kill the 3-Might Skulker → Faefolk and Skulker die, Vanilla Four keeps bfA for P1 (healed), nobody scores", async () => {
    const game = await dragResolved("bfA");
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2, total: 3 });
    await game.p2.distribute({ faefolk: 1, four: 2 });
    await game.settle();
    expect(game.zoneOf("faefolk")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.state("four")).toMatchObject({ damage: 0, zone: "battlefield-bfA" });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ── (B) dragged to open bfC ───────────────────────────────────────────────────────────

  test("(B) Faefolk arrives first at uncontrolled bfC and applies Contested (190.3.a) — already while its trigger is on the chain; Skulker's later arrival does not re-apply it: contestedBy stays P1", async () => {
    const game = await board().build();
    await moveAndDrag(game, "bfC");
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("skulker")).toBe("bfC");
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  });

  test("(B) both a Showdown and a Combat are staged → it opens as a Combat Showdown (461.3/344.1) with Attacker = P1, Defender = P2: P2 DEFENDS on P1's turn with the unit P1 dragged in", async () => {
    const game = await dragResolved("bfC");
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bfC", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("faefolk").combatRole).toBe("attacker");
    expect(game.state("skulker").combatRole).toBe("defender");
    expect(game.state("four").combatRole).toBeNull(); // elsewhere — no designation (323.2.c)
    expect(game.chain()).toEqual([]);
  });

  test("(B) Focus + Priority = P1 — triple (focus P1, deciding P1, showdown-open); P2 cannot Cleave yet: `can` is false, the cast throws, P2's menu is empty (312.1.b/313.4)", async () => {
    const game = await dragResolved("bfC");
    expect(showdown(game)?.focusPlayer).toBe(P1);
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p2.can("cast", "cleave")).toBe(false);
    expect(game.p2.legal()).toEqual([]);
    await expect(game.p2.cast("cleave", { targets: "skulker" })).rejects.toThrow();
    expect(game.zoneOf("cleave")).toBe("hand");
  });

  test("(B) P2 must wait until P1 passes Focus (347.2.b): then P2 holds Focus and Cleave becomes legal", async () => {
    const game = await dragResolved("bfC");
    await game.p1.passFocus();
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "cleave")).toBe(true);
  });

  test("(B) all pass: Faefolk 1 (attacker) vs Skulker 3 (defender) → Faefolk dies, Skulker survives healed; P2 — not the contester — establishes control and CONQUERS bfC on P1's turn (466.3.a, 466.5/.d/.e): P2 +1", async () => {
    const game = await dragResolved("bfC");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("faefolk")).toBe("trash");
    expect(game.state("skulker")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-bfC" });
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(B) side effect: Skulker was P2's only unit at bfB — dragging it away empties bfB, which goes uncontrolled at the Cleanup (190.4.c); P1's bfA is untouched", async () => {
    const game = await dragResolved("bfC");
    expect(game.gameState.battlefields.bfB?.controller ?? null).toBeNull();
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
  });

  // ── the contrast in one line ──────────────────────────────────────────────────────────

  test("same card, same dragged unit: the DESTINATION flips both the Attacker role and which seat holds Focus on P1's turn (A: P2/P2, B: P1/P1)", async () => {
    const a = await dragResolved("bfA");
    const b = await dragResolved("bfC");
    expect([showdown(a)?.attackingPlayer, showdown(a)?.focusPlayer, a.actingSeat()]).toEqual([P2, P2, P2]);
    expect([showdown(b)?.attackingPlayer, showdown(b)?.focusPlayer, b.actingSeat()]).toEqual([P1, P1, P1]);
  });
});
