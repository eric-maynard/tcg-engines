/**
 * Interaction: Vengeance (ogn-229-298) · Spell · Order · 4+[order][order] — "Kill a unit." (NO timing keyword)
 *   × Hextech Ray (ogn-009-298) · Spell · Fury · 1+[fury] — "[Action] Deal 3 to a unit at a battlefield."
 *   × Discipline (ogn-058-298) · Spell · Calm · 2 — "[Reaction] Give a unit +2 [Might] this turn. Draw 1."
 *   (+ vanilla Shipyard Skulker ogn-175-298, 3 Might, as the unit that walks onto empty bfC.)
 *
 * Question: P1's turn, Neutral Open, P1 has ample energy/power. P1's hand: Vengeance, Hextech Ray, Discipline.
 * P2's hand: Discipline. bfC is empty and uncontrolled; P2 has a unit at bfB as a Ray/Vengeance target. P1
 * Standard-Moves Skulker base→bfC, opening a Non-Combat Showdown.
 *   (a) With Focus+Priority on his OWN turn inside the showdown, which of P1's three cards are playable?
 *   (b) P1 passes. P2 has Focus on P1's turn. Which of P1's cards are playable now — is even the Reaction
 *       legal for the turn player?
 *   (c) P2 opens a chain with Discipline on its bfB unit and passes Priority. Now which of P1's cards are legal?
 *   (d) That chain empties — who has Focus? Everyone then passes out of the showdown: what is the
 *       (priority, focus, state) triple in the Neutral Open that follows, and is Vengeance finally legal?
 *
 * Rules: 345 (Contested-applier gains Focus), 313.2 (Focus brings Priority), 308.1.a / 313.1.a / 155 (only
 * Action/Reaction in a Showdown State; a plain spell only in Neutral Open on your turn), 358.4 (illegal play is
 * undone), 347.2.b (pass → Focus to next player), 312.1 / 312.1.b / 313.4 (no discretionary action without
 * Priority), 347.1 / 813.2 (Reaction is a legal chain opener for the Focus holder), 313.3 (passing Priority
 * keeps Focus), 309.1.a (Closed → Reaction only), 338.1.a.2 (Action can't join an existing chain), 346 (chain
 * from a played card closes → Focus passes to the next player, with Priority), 347.2.a / 348.2.a / 348.2.a.1
 * (all pass → showdown ends; sole occupant establishes control → Conquer), 313.5 (Neutral → nobody has Focus),
 * 335 / 312.2.a (turn player receives priority), 806.2.
 *
 * Expected: (a) (P1, P1, showdown-open): Hextech Ray ✔, Discipline ✔, Vengeance ✘. (b) (P2, P2, showdown-open),
 * turn player still P1: P1 can play NOTHING — not even Discipline. (c) P2's Discipline opens a chain; P2 passes
 * → priority P1, focus P2: Discipline ✔, Hextech Ray ✘, Vengeance ✘; P1 passes → Discipline resolves (+2, P2
 * draws 1). (d) Focus passes to P1 with Priority: (P1, P1, showdown-open), Vengeance still ✘. P1 passes, P2
 * passes → showdown closes; P1's Skulker alone at bfC → P1 conquers (+1). Neutral Open: focus = nobody,
 * priority = P1 (turn player) — not P2; Vengeance ✔, Hextech Ray ✔; P2 can play nothing.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VENGEANCE = "ogn-229-298";
const HEXTECH_RAY = "ogn-009-298";
const DISCIPLINE = "ogn-058-298";
const SHIPYARD_SKULKER = "ogn-175-298";

/**
 * P1's turn. P1: ample resources, Skulker in base, Vengeance + Hextech Ray + Discipline in hand.
 * P2: Discipline in hand with exactly its [2]; a 2-Might Dummy at P2's bfB. bfC empty and uncontrolled.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 10, power: { calm: 2, fury: 2, order: 2 } })
    .resources(P2, { energy: 2 })
    .battlefield("bfB", { controller: P2 })
    .battlefield("bfC", { controller: null })
    .unit(P2, "bfB", { might: 2, name: "Target Dummy" }, "dummy")
    .unit(P1, "base", SHIPYARD_SKULKER, "skulker")
    .hand(P1, VENGEANCE, "veng")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P1, DISCIPLINE, "discP1")
    .hand(P2, DISCIPLINE, "discP2");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** (priority holder, focus holder, state) as the harness sees it. */
function triple(game: Game): [string | undefined, string | null, string | undefined] {
  const d = game.decision();
  const sd = showdown(game);
  const focus = sd?.active ? (sd.focusPlayer ?? null) : null;
  const state = d?.kind === "action" ? (d.context === "showdown" ? "showdown-open" : d.context === "chain" ? "closed" : d.context) : d?.kind;
  return [game.actingSeat(), focus, state];
}

/** Which of P1's three spells are castable right now. */
function p1CanCast(game: Game): { veng: boolean; ray: boolean; disc: boolean } {
  return {
    disc: game.p1.can("cast", "discP1"),
    ray: game.p1.can("cast", "ray"),
    veng: game.p1.can("cast", "veng"),
  };
}

/** (a) Skulker walks onto empty bfC → Non-Combat Showdown, P1 holds Focus. */
async function showdownOpened(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("skulker", "bfC");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfC", focusPlayer: P1, isCombatShowdown: false });
  return game;
}

/** (b) …P1 passes → P2 holds Focus on P1's turn. */
async function p2HasFocus(): Promise<Game> {
  const game = await showdownOpened();
  await game.p1.passFocus();
  return game;
}

/** (c) …P2 opens a chain with Discipline on its Dummy and passes Priority to P1. */
async function p1HasPriorityP2HasFocus(): Promise<Game> {
  const game = await p2HasFocus();
  await game.p2.cast("discP2", { targets: "dummy" });
  expect(game.chain().map((i) => i.cardId)).toEqual(["discP2"]);
  await game.p2.passPriority();
  return game;
}

describe("Turn player without Focus is locked out — Vengeance / Hextech Ray / Discipline through a Non-Combat Showdown", () => {
  test("baseline: in the Neutral Open before the move all three of P1's spells are legal on his own turn (155, 806.2, 813)", async () => {
    const game = await board().build();
    expect(game.state("veng").keywords).not.toContain("Action");
    expect(game.state("veng").keywords).not.toContain("Reaction");
    expect(triple(game)).toEqual([P1, null, "main"]);
    expect(p1CanCast(game)).toEqual({ disc: true, ray: true, veng: true });
  });

  // ── (a) ─────────────────────────────────────────────────────────────────────────────────────────────

  test("(a) Skulker → empty bfC opens a Non-Combat Showdown; P1 applied Contested so P1 has Focus AND Priority: triple = (P1, P1, showdown-open) (345, 313.2)", async () => {
    const game = await showdownOpened();
    expect(game.zoneOf("skulker")).toBe("battlefield-bfC");
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(triple(game)).toEqual([P1, P1, "showdown-open"]);
    expect(game.turnPlayer()).toBe(P1);
  });

  test("(a) even for the Focus holder on his own turn only Action/Reaction cards are playable in a Showdown State: Hextech Ray ✔, Discipline ✔, Vengeance ✘ — the attempt is refused and nothing changes (308.1.a, 313.1.a, 155, 358.4)", async () => {
    const game = await showdownOpened();
    expect(p1CanCast(game)).toEqual({ disc: true, ray: true, veng: false });
    const r = await game.p1.try((p) => p.cast("veng", { targets: "dummy" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("veng")).toBe("hand");
    expect(game.zoneOf("dummy")).toBe("battlefield-bfB");
    expect(game.p1.energy()).toBe(10);
    expect(game.chain()).toEqual([]);
  });

  // ── (b) ─────────────────────────────────────────────────────────────────────────────────────────────

  test("(b) P1 passes → Focus (and Priority) go to P2 while it is still P1's turn: triple = (P2, P2, showdown-open) (347.2.b, 313.2)", async () => {
    const game = await p2HasFocus();
    expect(triple(game)).toEqual([P2, P2, "showdown-open"]);
    expect(game.turnPlayer()).toBe(P1);
    expect(showdown(game)?.active).toBe(true);
  });

  test("(b) the turn player now holds neither Focus nor Priority and can play NOTHING — not Vengeance, not Hextech Ray, and not even the Reaction Discipline; every attempt is refused (312.1, 312.1.b, 313.4)", async () => {
    const game = await p2HasFocus();
    expect(p1CanCast(game)).toEqual({ disc: false, ray: false, veng: false });
    expect(game.p1.legal()).toEqual([]);
    for (const card of ["veng", "ray", "discP1"] as const) {
      const r = await game.p1.try((p) => p.cast(card, { targets: "dummy" }));
      expect(r.ok).toBe(false);
      expect(game.zoneOf(card)).toBe("hand");
    }
    expect(game.chain()).toEqual([]);
    expect(game.p1.energy()).toBe(10);
    expect(triple(game)).toEqual([P2, P2, "showdown-open"]);
  });

  // ── (c) ─────────────────────────────────────────────────────────────────────────────────────────────

  test("(c) P2, holding Focus, may open a chain with the Reaction Discipline on its bfB unit (347.1, 813.2): priority P2, focus P2, Closed State", async () => {
    const game = await p2HasFocus();
    expect(game.p2.can("cast", "discP2")).toBe(true);
    await game.p2.cast("discP2", { targets: "dummy" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "discP2", controller: P2, targets: ["dummy"] })]);
    expect(triple(game)).toEqual([P2, P2, "closed"]);
    expect(game.p2.energy()).toBe(0);
  });

  test("(c) P2 passes Priority but RETAINS Focus (313.3): priority P1, focus P2. Now P1: Discipline ✔ (Reaction in a Closed State, 309.1.a), Hextech Ray ✘ (Action can't join an existing chain, 338.1.a.2), Vengeance ✘", async () => {
    const game = await p1HasPriorityP2HasFocus();
    expect(triple(game)).toEqual([P1, P2, "closed"]);
    expect(p1CanCast(game)).toEqual({ disc: true, ray: false, veng: false });
    expect((await game.p1.try((p) => p.cast("ray", { targets: "dummy" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("veng", { targets: "dummy" }))).ok).toBe(false);
    expect(game.chain().map((i) => i.cardId)).toEqual(["discP2"]);
  });

  test("(c) P1 declines and passes → Discipline resolves: Dummy +2 Might this turn (2→4), P2 draws 1, Discipline to P2's trash", async () => {
    const game = await p1HasPriorityP2HasFocus();
    const p2Hand = game.p2.hand().length;
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("dummy").might).toBe(4);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.zoneOf("discP2")).toBe("trash");
  });

  // ── (d) ─────────────────────────────────────────────────────────────────────────────────────────────

  test("(d) the chain was opened by a PLAYED card → when it empties Focus passes to the next player: P1 gains Focus and Priority, still inside the showdown: (P1, P1, showdown-open); Vengeance is STILL illegal, Ray/Discipline legal again (346, 308.1.a)", async () => {
    const game = await p1HasPriorityP2HasFocus();
    await game.p1.passPriority(); // Discipline resolves
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfC", focusPlayer: P1 });
    expect(triple(game)).toEqual([P1, P1, "showdown-open"]);
    expect(p1CanCast(game)).toEqual({ disc: true, ray: true, veng: false });
    expect((await game.p1.try((p) => p.cast("veng", { targets: "dummy" }))).ok).toBe(false);
  });

  test("(d) P1 passes, P2 passes → all passed in sequence, the showdown closes; only P1's Skulker is at bfC → P1 establishes control and Conquers (+1) (347.2.a, 348.2.a, 348.2.a.1)", async () => {
    const game = await p1HasPriorityP2HasFocus();
    await game.p1.passPriority();
    await game.p1.passFocus();
    expect(triple(game)).toEqual([P2, P2, "showdown-open"]);
    await game.p2.passFocus();
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("skulker")).toBe("battlefield-bfC");
  });

  test("(d) the Neutral Open that follows: focus = NOBODY (313.5), priority = P1 as Turn Player in Main Phase (335, 312.2.a) — NOT P2 although P2 was the last non-turn Focus holder; Vengeance is finally legal ✔, Hextech Ray ✔ (155, 806.2); P2 can play nothing", async () => {
    const game = await p1HasPriorityP2HasFocus();
    await game.p1.passPriority();
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(triple(game)).toEqual([P1, null, "main"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.turnPlayer()).toBe(P1);
    expect(p1CanCast(game)).toEqual({ disc: true, ray: true, veng: true });
    expect(game.p2.legal()).toEqual([]);
    // …and Vengeance now actually plays: kill the (still +2) Dummy.
    await game.p1.cast("veng", { targets: "dummy" });
    expect(game.p1.resources()).toEqual({ energy: 6, power: { calm: 2, fury: 2, order: 0 } });
    await game.settle();
    expect(game.zoneOf("dummy")).toBe("trash");
    expect(game.zoneOf("veng")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
