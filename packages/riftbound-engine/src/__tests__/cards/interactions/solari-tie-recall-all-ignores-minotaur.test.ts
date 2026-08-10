/**
 * Interaction: Symbol of the Solari (ogn-227-298) × Minotaur Reckoner (sfd-014-221) × Galio, Indefatigable
 * (unl-171-219) — with Playful Phantom (ogn-049-298, vanilla 5) as the defender.
 *
 *   Symbol of the Solari — Gear · Order · 1
 *     "If a combat where you are the attacker ends in a tie, recall ALL units instead. (Send them to
 *      base. This isn't a move. Ties are calculated after combat damage is dealt.)"
 *   Minotaur Reckoner — Unit · Fury · 5 · 5 Might — "Units can't move to base."
 *   Galio, Indefatigable — Champion Unit · Order · 3 · 6 Might — "[Deflect] [Tank] I don't deal combat damage."
 *
 * Rules: 466.1.a.2 (combat cleanup step 3d: recall the ATTACKERS present if defenders remain);
 * 466.3.d / 466.3.d.1 ("No Result" if units were recalled in 3d / both / neither player has units; a
 * new showdown is staged only if BOTH players still have units there); 466.5.b (no units of any player
 * left → the battlefield becomes UNCONTROLLED); 456 / 456.1 / 456.3 (Recalls are not Moves: no move
 * triggers, and they cannot be prevented by effects that restrict or block movement); 369.1 / 370.1.b
 * ("instead" = a replacement effect on the 3d recall); 054.1 ("can't" beats "can" — but only when the
 * forbidden thing is actually the thing being done: a Recall is not a move to base).
 *
 * Question: P1 (Solari in base) attacks P2's bf1 — defended by Playful Phantom (5) — with Galio (6, Tank,
 * deals no combat damage). P2 also has Minotaur Reckoner ("Units can't move to base") in base.
 *   (a) After combat damage both units live — is that a tie, and what does Solari replace?
 *   (b) Does Reckoner stop either unit from being sent to base? Any move-trigger interaction?
 *   (c) Who controls bf1 afterwards? Is another showdown staged?
 *   (d) Contrast 1: same combat WITHOUT Solari. Contrast 2: P2 attacks P1's Galio while P1 (the
 *       DEFENDER) owns Solari.
 *
 * Expected: (a) Galio deals 0, Phantom's 5 is not lethal to Galio's 6 → both remain = tie; Solari
 * replaces "recall attackers" with "recall ALL units there": Galio → P1 base, Phantom → P2 base; no
 * ordering Decision. (b) No — these are Recalls (456.3), Reckoner is irrelevant; no move triggers /
 * move bookkeeping (456.1). (c) Neither player has units at bf1 → No Result, no re-staged showdown
 * (466.3.d.1), bf1 becomes UNCONTROLLED (466.5.b): P2 loses it, P1 neither conquers nor scores.
 * (d1) Only Galio is recalled (still despite Reckoner), Phantom stays, P2 keeps bf1. (d2) "where you
 * are the attacker" is false → no replacement: only P2's attacking Phantom is recalled, P1 keeps bf1.
 */
import { describe, expect, test } from "bun:test";
import type { Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SOLARI = "ogn-227-298";
const RECKONER = "sfd-014-221";
const GALIO = "unl-171-219";
const PHANTOM = "ogn-049-298";

/**
 * `attacker`'s turn. The defender holds bf1 with their unit (P2 → Phantom, P1 → Galio); the attacker's
 * unit waits in base. Minotaur Reckoner always sits in P2's base. `solariFor` puts the Symbol in that
 * player's base.
 */
function board(opts: { attacker?: Seat; solariFor?: Seat } = {}) {
  const attacker = opts.attacker ?? P1;
  const defender = attacker === P1 ? P2 : P1;
  let b = scenario()
    .active(attacker)
    .battlefield("bf1", { controller: defender })
    .unit(P1, attacker === P1 ? "base" : "bf1", GALIO, "galio")
    .unit(P2, attacker === P2 ? "base" : "bf1", PHANTOM, "phantom")
    .unit(P2, "base", RECKONER, "reck");
  if (opts.solariFor) {
    b = b.gear(opts.solariFor, SOLARI, "sol");
  }
  return b;
}

type Built = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;

/** P1's Galio attacks bf1 and the combat is played out with nobody acting in the showdown. */
async function galioAttacks(opts: { solariFor?: Seat } = {}): Promise<Built> {
  const game = await board({ attacker: P1, ...opts }).build();
  await game.p1.move("galio", "bf1");
  expect(game.state("galio").combatRole).toBe("attacker");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P2 });
  const r = await game.settle();
  expect(r.reason).toBe("open"); // straight back to P1's main phase — no ordering / replacement Decision on the way
  return game;
}

describe("Symbol of the Solari tie → recall ALL, Minotaur Reckoner notwithstanding", () => {
  // ── premise: Reckoner's restriction is live on every unit ─────────────────────────────────

  test("premise: Minotaur Reckoner's 'Units can't move to base' blankets every unit on the board (Galio and Phantom included)", async () => {
    const game = await board({ solariFor: P1 }).build();
    for (const c of ["galio", "phantom", "reck"]) {
      expect(game.state(c).keywords).toContain("NoMoveToBase");
    }
    expect(game.p1.gear()).toEqual(["sol"]);
    expect(game.state("galio")).toMatchObject({ might: 6, zone: "base" });
    expect(game.state("galio").keywords).toEqual(expect.arrayContaining(["Tank", "Deflect", "NoCombatDamage"]));
    expect(game.state("phantom")).toMatchObject({ might: 5, zone: "battlefield-bf1" });
  });

  // ── (a) it is a tie; Solari recalls ALL ───────────────────────────────────────────────────

  test("(a) Galio deals no combat damage and Phantom's 5 doesn't kill Galio (6): both survive the damage step — a tie — and with Solari BOTH are recalled: Galio → P1's base, Phantom → P2's base", async () => {
    const game = await galioAttacks({ solariFor: P1 });
    expect(game.zoneOf("galio")).toBe("base");
    expect(game.zoneOf("phantom")).toBe("base");
    expect(game.p1.base()).toEqual(expect.arrayContaining(["galio", "sol"]));
    expect(game.p2.base()).toEqual(expect.arrayContaining(["phantom", "reck"]));
    // Nobody died; combat cleanup healed whatever was marked (466.1.a.1).
    expect(game.p1.trash()).toEqual([]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.state("galio").damage).toBe(0);
    expect(game.state("phantom").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ── (b) Recalls are not Moves ─────────────────────────────────────────────────────────────

  test("(b) Reckoner's 'can't move to base' does not stop either recall (456.3) — and the recall is not move bookkeeping: P2 has moved 0 units, Phantom is not exhausted, nothing was put on the chain (456.1)", async () => {
    const game = await galioAttacks({ solariFor: P1 });
    expect(game.locationOf("phantom")).toBe("base"); // recalled straight past the Reckoner
    expect(game.locationOf("galio")).toBe("base");
    expect(game.gameState.unitsMovedThisTurn).toEqual({ [P1]: 1, [P2]: 0 }); // only Galio's actual attack move
    expect(game.state("phantom").isExhausted).toBe(false);
    expect(game.state("galio").isExhausted).toBe(true); // from its own standard move, not from the recall
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("reck")).toBe("base"); // "ALL units" = all units in that combat, not the Reckoner at home
  });

  // ── (c) result: uncontrolled, no new showdown, no points ──────────────────────────────────

  test("(c) with nobody left at bf1 it is 'No Result' and bf1 becomes UNCONTROLLED (466.3.d, 466.5.b): P2 loses it, P1 does not conquer or score, no showdown is re-staged (466.3.d.1)", async () => {
    const game = await galioAttacks({ solariFor: P1 });
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.conqueredThisTurn[P1] ?? []).toEqual([]);
    expect(game.gameState.scoredThisTurn[P1] ?? []).toEqual([]);
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.phase()).toBe("main");
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(c) …and it stays uncontrolled into P2's turn: P2 does not Hold-score bf1 at the start of their turn", async () => {
    const game = await galioAttacks({ solariFor: P1 });
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0);
  });

  // ── (d) contrast 1: no Solari ─────────────────────────────────────────────────────────────

  test("(d1) without Solari the same tie recalls ONLY the attacker (466.1.a.2) — Galio → base even under Reckoner (456.3); Phantom stays, P2 keeps bf1, No Result, no points", async () => {
    const game = await galioAttacks();
    expect(game.zoneOf("galio")).toBe("base");
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.state("galio").damage).toBe(0); // healed in cleanup; it survived the 5
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
  });

  // ── (d) contrast 2: Solari's controller is the DEFENDER ───────────────────────────────────

  test("(d2) P2's Phantom attacks P1's Galio while P1 (defender) owns Solari: 'where you are the attacker' is false → no replacement; only the attacking Phantom is recalled (past Reckoner), Galio stays and P1 keeps bf1", async () => {
    const game = await board({ attacker: P2, solariFor: P1 }).build();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.p2.move("phantom", "bf1");
    expect(game.state("phantom").combatRole).toBe("attacker");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("phantom")).toBe("base");
    expect(game.zoneOf("galio")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.unitsMovedThisTurn).toEqual({ [P1]: 0, [P2]: 1 });
    expect(game.violations()).toEqual([]);
  });
});
